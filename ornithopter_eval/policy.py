"""File operations only. No shell interpreter or subprocess is ever invoked here."""
import shlex
from pathlib import Path, PurePosixPath


class PolicyError(ValueError):
    pass


class FilePolicy:
    def __init__(self, root, max_bytes=2_000_000):
        self.root = Path(root).resolve()
        self.max_bytes = max_bytes

    def path(self, name, write=False):
        if not isinstance(name, str) or not name or "\\" in name or "\x00" in name:
            raise PolicyError("Invalid relative path")
        p = PurePosixPath(name)
        if p.is_absolute() or any(x in ("..", ".") or x.startswith(".") for x in p.parts):
            raise PolicyError("Path is outside the visible workspace")
        if not p.parts or p.parts[0] not in ("inputs", "submission"):
            raise PolicyError("Paths must begin inputs/ or submission/")
        if write and (p.parts[0] != "submission" or len(p.parts) < 2):
            raise PolicyError("Only submission files are writable")
        if write and p.suffix not in (".html", ".mjs", ".js", ".css", ".json", ".md"):
            raise PolicyError("Only HTML, JS, CSS, JSON and Markdown files are writable")
        target = self.root
        for part in p.parts:
            target = target / part
            if target.is_symlink():
                raise PolicyError("Symlinks are not permitted")
        if not target.resolve().is_relative_to(self.root):
            raise PolicyError("Path escapes workspace")
        return target

    def inspect(self, command):
        """An intentionally tiny, virtual shell. Quoting never invokes a shell."""
        if not isinstance(command, str) or len(command) > 2048:
            raise PolicyError("Invalid command")
        if any(c in command for c in "\n\r;|&`$<>()"):
            raise PolicyError("Shell syntax is not available")
        try:
            words = shlex.split(command)
        except ValueError as exc:
            raise PolicyError(str(exc)) from exc
        if len(words) == 2 and words[0] == "ls":
            p = self.path(words[1])
            if not p.is_dir():
                raise PolicyError("Not a directory")
            children = sorted(x.name + ("/" if x.is_dir() else "")
                              for x in p.iterdir() if not x.name.startswith(".") and not x.is_symlink())
            return "\n".join(children)[:20000]
        lines = None
        if len(words) == 2 and words[0] == "cat":
            p = self.path(words[1])
        elif len(words) == 4 and words[:2] == ["head", "-n"] and words[2].isdigit():
            lines = min(int(words[2]), 2000)
            p = self.path(words[3])
        else:
            raise PolicyError("Only ls PATH, cat PATH, head -n N PATH are available")
        if not p.is_file() or p.stat().st_size > 100000:
            raise PolicyError("File missing, binary, or over 100 KB")
        try:
            content = p.read_text(encoding="utf-8")
        except UnicodeError as exc:
            raise PolicyError("Images are supplied in the API input, not through cat") from exc
        return content if lines is None else "\n".join(content.splitlines()[:lines])

    def apply(self, operation):
        if not isinstance(operation, dict):
            raise PolicyError("Invalid patch operation")
        p = self.path(operation.get("path"), write=True)
        kind = operation.get("type")
        if kind == "delete_file":
            if not p.is_file():
                raise PolicyError("File does not exist")
            p.unlink()
            return
        diff = operation.get("diff")
        if not isinstance(diff, str) or len(diff.encode()) > self.max_bytes:
            raise PolicyError("Missing or oversized diff")
        if kind == "create_file":
            if p.exists():
                raise PolicyError("File already exists; use update_file")
            lines = diff.splitlines()
            if any(not line.startswith("+") for line in lines):
                raise PolicyError("Create-file diff lines must start with +")
            content = "\n".join(line[1:] for line in lines) + ("\n" if lines else "")
        elif kind == "update_file":
            if not p.is_file():
                raise PolicyError("File does not exist")
            content = update_text(p.read_text(encoding="utf-8"), diff)
        else:
            raise PolicyError("Unsupported operation type")
        files = list((self.root / "submission").rglob("*"))
        if len(files) > 100:
            raise PolicyError("Submission file count exceeded")
        total = sum(x.stat().st_size for x in files if x.is_file() and x != p)
        if total + len(content.encode()) > self.max_bytes:
            raise PolicyError("Submission byte limit exceeded")
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")


def update_text(original, diff):
    """Exact, unique-context native apply_patch hunks; no fuzzy matching."""
    source = original.splitlines()
    output, cursor = [], 0
    chunks, current = [], None
    for line in diff.splitlines():
        if line.startswith("@@"):
            if current is not None:
                chunks.append(current)
            current = {"anchor": line[2:].strip(), "lines": [], "eof": False}
        elif line == "*** End of File":
            if current is None:
                raise PolicyError("Missing hunk")
            current["eof"] = True
        else:
            if current is None:
                current = {"anchor": "", "lines": [], "eof": False}
            if not line or line[0] not in " +-":
                raise PolicyError("Invalid patch hunk")
            current["lines"].append(line)
    if current is not None:
        chunks.append(current)
    if not chunks:
        raise PolicyError("Empty update")
    for chunk in chunks:
        old = [x[1:] for x in chunk["lines"] if x[0] in " -"]
        new = [x[1:] for x in chunk["lines"] if x[0] in " +"]
        start = cursor
        if chunk["anchor"]:
            anchors = [i for i in range(cursor, len(source)) if source[i] == chunk["anchor"]]
            if len(anchors) != 1:
                raise PolicyError("Anchor is absent or ambiguous")
            start = anchors[0] + 1
        matches = [i for i in range(start, len(source) - len(old) + 1)
                   if source[i:i + len(old)] == old
                   and (not chunk["eof"] or i + len(old) == len(source))]
        if len(matches) != 1:
            raise PolicyError("Patch context is absent or ambiguous; supply exact unique context")
        index = matches[0]
        output.extend(source[cursor:index])
        output.extend(new)
        cursor = index + len(old)
    output.extend(source[cursor:])
    return "\n".join(output) + ("\n" if output else "")
