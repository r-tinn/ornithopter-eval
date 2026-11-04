"""Reproduce the dimensional audit of the published toy model; not an aircraft prediction."""
import argparse
import hashlib
import json
import math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]


def audit():
    inputs=json.loads((ROOT/'candidate/mechanical-v4/engineering.json').read_text())
    mass=inputs['mass_kg'];g=inputs['gravity_m_s2'];rho=inputs['rho_kg_m3']
    ar=7.4**2/6.61;area=inputs['span_m']**2/ar;eta=inputs['propulsive_efficiency'];shaft=inputs['maximum_mechanical_power_w']
    cd0=.035;e=.8;cl_cap=1.4;weight=mass*g;k=1/(math.pi*e*ar)
    def level(v,m=mass,cd=cd0,eff=eta,bank=0):
        w=m*g;qS=.5*rho*v*v*area;load=1/math.cos(bank);cl=w*load/qS
        parasite=qS*cd;induced=qS*k*cl*cl;power=(parasite+induced)*v
        return {'speed_m_s':v,'bank_rad':bank,'cl':cl,'within_CL_cap':cl<=cl_cap+1e-12,
            'parasite_power_W':parasite*v,'induced_power_W':induced*v,'useful_power_required_W':power,
            'shaft_power_required_W':power/eff,'lift_drag_ratio':w*load/(parasite+induced)}
    minimum_speed=math.sqrt(2*weight/(rho*area*cl_cap))
    A=.5*rho*area*cd0;B=k*weight**2/(.5*rho*area)
    unconstrained_min=(B/(3*A))**.25;minimum_power_speed=max(minimum_speed,unconstrained_min)
    trim_speed=math.sqrt(2*weight/(rho*area*.6));trim=level(trim_speed);bank=level(trim_speed,bank=.6)
    measurements=json.loads((ROOT/'analysis/flight-probe.json').read_text())
    energy=[];bank_response=[]
    for model,record in measurements['models'].items():
        samples=record['pairs']['full_power_climb']['samples']
        for name,s in [('steady_straight',samples[0]['straight']),('banked_after_20_s',samples[-1]['banked'])]:
            state=s['state'];V=s['speed_m_s'];qS=.5*rho*V*V*area
            alpha=state['pitch']-math.atan2(state['velocity'][1],math.hypot(state['velocity'][0],state['velocity'][2]))
            cl=max(-.2,min(1.4,.6+3*alpha))
            drag=qS*(cd0+k*cl*cl);drag_power=drag*V;potential=weight*s['climb_rate_m_s']
            energy.append({'model':model,'case':name,'drag_power_W':drag_power,'potential_energy_gain_W':potential,
                'useful_power_input_W':shaft*eta,'steady_balance_residual_W':drag_power+potential-shaft*eta,
                'climb_rate_m_s':s['climb_rate_m_s'],'speed_m_s':V,
                'note':'Steady-state diagnostic. Small residuals in a turn can include explicit Euler integration error and remaining kinetic-energy change.'})
        for case,trial in record['pairs'].items():
            for sample in trial['samples']:
                if sample['elapsed_s'] in (1,20):
                    bank_response.append({'model':model,'case':case,'throttle':trial['throttle'],'elapsed_s':sample['elapsed_s'],
                        'straight_climb_rate_m_s':sample['straight']['climb_rate_m_s'],
                        'banked_climb_rate_m_s':sample['banked']['climb_rate_m_s'],
                        'altitude_difference_m':sample['altitude_difference_m']})
    measured_speed=measurements['models']['gpt-6.1-sol']['pairs']['full_power_climb']['samples'][0]['straight']['speed_m_s']
    sensitivities=[]
    for label,m,eff,cd,p in [('published',mass,eta,cd0,shaft),('illustration_lower_conversion',mass,.35,cd0,shaft),('illustration_higher_mass',10,eta,cd0,shaft),('illustration_higher_parasite_drag',mass,eta,.07,shaft),('illustration_lower_drive_power',mass,eta,cd0,200)]:
        v=math.sqrt(2*m*g/(rho*area*.6));req=level(v,m=m,cd=cd,eff=eff)
        sensitivities.append({'scenario':label,'mass_kg':m,'propulsive_efficiency':eff,'CD0':cd,'shaft_power_W':p,
            'useful_power_W':p*eff,'level_power_required_W':req['useful_power_required_W'],
            'level_excess_power_climb_estimate_m_s':(p*eff-req['useful_power_required_W'])/(m*g),
            'status':'sensitivity only; not a validated replacement configuration'})
    return {'kind':'specification power and energy audit','physical_aircraft_validated':False,
        'inputs':inputs,'source_ratios':{'aspect_ratio':ar,'wrist_fraction':.5},
        'derived':{'wing_area_m2':area,'wing_loading_kg_m2':mass/area,'shaft_power_per_all_up_mass_W_kg':shaft/mass,
            'useful_propulsive_power_W':shaft*eta,'CL_cap_limited_minimum_level_speed_m_s':minimum_speed},
        'level_flight':[level(minimum_power_speed),trim,level(measured_speed)],
        'banking':{'max_bank_rad':.6,'max_bank_deg':.6*180/math.pi,'instant_vertical_lift_ratio':math.cos(.6),
            'coordinated_level_turn_load_factor':1/math.cos(.6),'induced_drag_multiplier_at_fixed_speed':1/math.cos(.6)**2,
            'level_at_trim_speed':trim,'level_turn_same_speed':bank,'extra_useful_power_for_level_turn_W':bank['useful_power_required_W']-trim['useful_power_required_W'],
            'initial_bank_acceleration_at_level_trim_m_s2':g*(math.cos(.6)-1),'neutral_level_trim_throttle':trim['useful_power_required_W']/(shaft*eta),
            'key_release_auto_level_time_from_max_s':.6/2},
        'measured_steady_energy_balance':energy,'measured_bank_response':bank_response,'sensitivity':sensitivities,
        'illustrative_endurance':{'usable_battery_Wh':100,'assumed_electrical_to_shaft_efficiency':.85,'shaft_power_W':400,
            'electrical_power_W':400/.85,'ideal_time_minutes_before_auxiliary_loads':100/(400/.85)*60,
            'status':'Dimensional example only; usable capacity and motor/transmission efficiency are not specified in the task.'},
        'findings':[
            '400 W is specified as mechanical power. The existing 0.65 is applied after that boundary; it is not a measured battery-to-flight efficiency.',
            'The task has no battery/fuel capacity, depletion, component mass allocation, power-duration limits or thermal model.',
            'The combination of mass, drag and available power gives a large excess-power margin. This explains strong climb; it does not prove 400 W is impossible for a real mechanical aircraft.',
            'CD0, span efficiency, CL cap and propulsion efficiency are assumed constants, not measurements of the rendered mechanism.',
            'The specified polar includes lift-induced drag. The critique is lack of calibration and complete-system accounting, not omission of all cost of lift.',
            'The CL function clamps instead of modelling a post-stall decrease, and attitude is directly commanded with automatic roll levelling.',
            'Lift and thrust are cycle-averaged functions of state, not computed from the actual wing geometry, wing motion, mechanism inertia or peak actuator loads.',
            'Additional mechanism losses must be assigned explicit boundaries; they must not be added twice if a measured lumped efficiency already includes them.',
            'Mechanical is not an energy-store category. Batteries, fuel, motor/engine power and all-up mass must be specified separately.',
            'No power or aerodynamic numbers have been changed by the wheel-grader update. Sensitivity cases are not recommended hardware designs.'
        ],
        'recommended_next_specification':[
            'Select an explicit electric or engine architecture and define all-up mass with component allocations.',
            'Separate stored Wh or fuel mass, electrical/chemical input power, shaft power and useful aerodynamic power; include reserve and finite endurance.',
            'Keep a cheap cycle-averaged model, but calibrate drag/propulsion/trim/climb against a named prototype or documented dataset.',
            'Define reference area, drag of the full airframe/gear, lift/drag envelopes and treatment of stall; document what remains an approximation.',
            'Test banking from a reproducible level-flight trim near power balance, rather than demanding descent during every full-power climbing turn.'
        ],
        'references':[
            {'url':'https://web.mit.edu/16.unified/www/FALL/thermodynamics/notes/node100.html','supports':'Excess propulsive power divides into climb and kinetic-energy change; useful power is not the same boundary as shaft power.'},
            {'url':'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/induced-drag-coefficient/','supports':'Lift-induced drag, aspect ratio, efficiency factor and reference area.'},
            {'url':'https://www.molicel.com/inr-21700-p45b/','supports':'A real high-power lithium-ion cell: manufacturer lists 16.2 Wh and 242 Wh/kg at cell level; not pack usable energy.'},
            {'url':'https://www.hydrogen.energy.gov/docs/hydrogenprogramlibraries/pdfs/hydrogen-program-plan-2024.pdf#page=31','supports':'DOE gives gasoline lower heating value about 12 kWh/kg; chemical energy excludes engine/tank mass and conversion losses.'},
            {'url':'https://www.festo.com/PDF_Flip/corp/smartbird_en/files/assets/seo/page54.html','supports':'Festo lists SmartBird 450 g, 2 m span, 23 W electrical; a different aircraft and power boundary, not a calibration of this task.'},
            {'url':'https://media.festo.com/media/113631_documentation.pdf#page=6','supports':'Manufacturer separately reports electromechanical and aerodynamic efficiencies; cannot transfer either to this craft without matching boundaries.'}
        ],
        'source_sha256':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ('candidate/mechanical-v4/engineering.json','analysis/flight-probe.json')}}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',default=str(ROOT/'analysis/power-model.json'));args=parser.parse_args()
    result=audit();Path(args.output).write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'derived':result['derived'],'banking':result['banking'],'steady_energy':result['measured_steady_energy_balance']},indent=2))
