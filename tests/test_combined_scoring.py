import unittest
from analysis.plot_variance_results import combine


class CombinedScoringTests(unittest.TestCase):
    def data(self, raw=7, human=5, valid=True):
        return {'rows':[{'model':'fixture','raw_task_checks':raw,'aesthetic_realism':human,'file_only_valid':valid}], 'models':[{'model':'fixture'}]}

    def test_equal_weight_and_human_scale(self):
        self.assertEqual(combine(self.data())['rows'][0]['combined_percent'],100)
        self.assertEqual(combine(self.data(human=1))['rows'][0]['combined_percent'],90)
        self.assertEqual(combine(self.data(raw=6))['rows'][0]['combined_percent'],87.5)

    def test_failed_policy_zeros_everything_without_changing_components(self):
        result=combine(self.data(valid=False))
        self.assertEqual(result['models'][0]['combined_mean'],0)
        self.assertEqual(result['rows'][0]['raw_task_checks'],7)
        self.assertEqual(result['rows'][0]['aesthetic_realism'],5)

    def test_policy_zero_is_included_in_the_model_mean(self):
        data=self.data()
        data["rows"].append({**data["rows"][0],"file_only_valid":False})
        self.assertEqual(combine(data)["models"][0]["combined_mean"],50)

    def test_missing_evidence_is_not_an_invented_score(self):
        for args in ({'human':None},{'human':True},{'human':6},{'raw':None},{'valid':None}):
            with self.subTest(args=args),self.assertRaises(ValueError):combine(self.data(**args))
