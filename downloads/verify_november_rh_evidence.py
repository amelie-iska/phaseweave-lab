"""Audit the exported November RH challenge and separately published verification logs."""
import argparse
from array import array
from functools import cache
from hashlib import file_digest, sha1
import json
from pathlib import Path
import re


PINS = {
    "Audit.lean": "5d54e164c67969da6169bd9a4d5b990ae9e7a7ffe16345dcebef257b0227d346",
    "Challenge.lean": "a3cebbf30be6b9268a0ed413c9bbc256dfa9f4bfa04f1a75f144d135da5e21a5",
    "Main.lean": "017645ca448f2fd1f6fd5c4c2cb2c6e96e472725be13f6e180ca6e1574360939",
    "Statements.lean": "79ef7ca776e42abe1f46caee13ea09bd19f1e2d0b1620d8d5d200258f33b47bf",
    "export-targets.txt": "9eeb2e5e55be4a78f6e4983fc950dba915b45ad8aeb7a02a32341927a89e05e8",
    "audit.log": "0a1473fce6eed840011f4a76b1c51558fc6f03edd1e6bd1ee542e6c738d87a62",
    "challenge.ndjson": "bd484ac9886a96f26b1d9a7a59ebd45b7a70d102c015d4f31f9302bbdd6ab2b9",
    "challenge.ndjson.zst": "c24ef99dab3556a52c7fb886e03cf22a242f3b96f82ae4cc40539e5d2f678ac6",
    "comparator.json": "8ea890e6ccda9cf3983ada343af18a41d12542036875a3936e7925ed5b1582ff",
    "con-leche-compare.log": "5a068bf55f24904eea9f05eda947c63d43bdee3c6ab0490e43943a3bd9af1f6e",
    "con-leche-master.log": "23e27eacb9e8378569474cc185c0e98f6b995b4db0f8df88fd48a921084fed02",
    "nanoda.log": "d4c5360b02d8dd885150c1cc28b616cb6fb5bf5b20d142558d79a7b15ae9d9df",
    "project-oleans.sha256": "375cbee2fc3fc0f5088ef2e6dc9a5ac5530924310dc62422ec65aac9dc4c1d25",
    "remark.pdf": "3fc97784b71ddd44ff8aa0a177e99622a1c61b13cfa843a0989ee4a7a0cfeb8d",
}
THEOREMS = {
    "riemannHypothesis": "RiemannHypothesis",
    "riemannZeta_eq_zero_re": "RiemannZetaZerosOnLine",
    "LFunction_ne_zero_of_half_lt_re": "DirichletLNonvanishingRightOfHalf",
    "LFunction_eq_zero_re": "DirichletLZerosOnLine",
    "LFunction_eq_zero_re_of_isPrimitive": "PrimitiveDirichletLZerosOnLine",
}
AXIOMS = {"propext", "Quot.sound", "Classical.choice"}
ZETA_BINDERS = ("Complex", "Eq", "Not", "Ne")
DIRICHLET = ("Nat", "NeZero", "DirichletCharacter")
BINDER_HEADS = {
    "riemannHypothesis": ZETA_BINDERS,
    "riemannZeta_eq_zero_re": ZETA_BINDERS,
    "LFunction_ne_zero_of_half_lt_re": (*DIRICHLET, "Complex", "LT.lt", "Or"),
    "LFunction_eq_zero_re": (*DIRICHLET, "Complex", "LT.lt", "LT.lt", "Eq"),
    "LFunction_eq_zero_re_of_isPrimitive": (*DIRICHLET, "DirichletCharacter.IsPrimitive",
                                           "Complex", "LT.lt", "LT.lt", "Eq"),
}

COMMUNITY = "b81a2baace751ad4c7c9c285fdbb8e3c8a567332"
ADVERTISED_EXPORT_BYTES = 350_862_970
IDS = re.compile(rb'"(in|ie)":(\d+)(?:[,}])')
TOP_STR = re.compile(rb'^\{"in":(\d+),"str":\{"pre":0,"str":"([A-Za-z0-9_]+)"\}\}$')


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def checked(path, expected):
    with path.open("rb") as source:
        found = file_digest(source, "sha256").hexdigest()
    require(found == expected, "Source bytes changed: " + path.name)


def deploy_challenge_reader(source):
    """Record file offsets, then inspect only the reachable types of the five roots."""
    names, expressions = array("Q", [0]), array("Q")
    targets = {}
    needed = set(THEOREMS) | set(THEOREMS.values())
    source.seek(0)
    raw = source.readline()
    meta = json.loads(raw)["meta"]
    offset = len(raw)
    for raw in source:
        matches = IDS.search(raw)
        if matches:
            prefix, number = matches.groups()
            index = names if prefix == b"in" else expressions
            index_id = int(number)
            require(len(index) == index_id, "Export index is out of scope")
            index.append(offset)
            if prefix == b"in":
                root = TOP_STR.fullmatch(raw.rstrip(b"\n"))
                if root:
                    spelling = root[2].decode()
                    if spelling in needed:
                        require(spelling not in targets, "Repeated root name")
                        targets[spelling] = index_id
        offset += len(raw)
    require(set(targets) == needed, "Top-level declaration names differ")
    return meta, offset, names, expressions, targets


def exported_scope(path):
    with path.open("rb") as source:
        meta, size, names, expressions, root = deploy_challenge_reader(source)
        by_id = {number: name for name, number in root.items()}
        declarations = {}
        source.seek(0)
        for raw in source:
            if raw.startswith((b'{"def":', b'{"thm":')):
                if not any(b'"name":'+str(i).encode()+b"," in raw for i in by_id):
                    continue
                data = json.loads(raw)
                kind, row = next(iter(data.items()))
                if row["name"] in by_id:
                    key = by_id[row["name"]]
                    require(key not in declarations, "Repeated exported declaration")
                    declarations[key] = (kind, row)
        require(set(declarations) == set(root), "The export lacks a named root declaration")

        @cache
        def name(idx):
            if idx == 0:
                return ""
            source.seek(names[idx])
            row = json.loads(source.readline())
            require(row["in"] == idx, "Name index mismatch")
            kind = "str" if "str" in row else "num"
            record = row[kind]
            prefix = name(record["pre"])
            leaf = record["str"] if kind == "str" else str(record["i"])
            return prefix+"."+leaf if prefix else leaf

        @cache
        def expr(idx):
            source.seek(expressions[idx])
            row = json.loads(source.readline())
            require(row.pop("ie") == idx and len(row) == 1, "Expression index mismatch")
            return next(iter(row.items()))

        def operator(idx):
            kind, row = expr(idx)
            while kind == "app":
                kind, row = expr(row["fn"])
            return name(row["name"]) if kind == "const" else kind

        def arguments(idx):
            args = []
            kind, row = expr(idx)
            while kind == "app":
                args.append(row["arg"])
                kind, row = expr(row["fn"])
            return list(reversed(args))

        def integer_literal(idx):
            require(operator(idx) == "OfNat.ofNat", "Expected an elaborated natural numeral")
            kind, value = expr(arguments(idx)[-2])
            require(kind == "natVal", "Expected a literal numeral")
            return int(value)

        def half(idx):
            require(operator(idx) == "HDiv.hDiv", "Expected an elaborated real fraction")
            return [integer_literal(atom) for atom in arguments(idx)[-2:]] == [1, 2]

        def atoms(idx):
            visited, consts = set(), set()
            frontier = [idx]
            while frontier:
                handle = frontier.pop()
                if handle in visited:
                    continue
                visited.add(handle)
                kind, row = expr(handle)
                if kind == "const":
                    consts.add(name(row["name"]))
                elif kind == "app":
                    frontier.extend((row["fn"], row["arg"]))
                elif kind in ("lam", "forallE"):
                    frontier.extend((row["type"], row["body"]))
                elif kind not in ("bvar", "sort", "natVal", "strVal"):
                    raise ValueError("Unexpected expression in challenge statement: "+kind)
            return consts

        records = {}
        for theorem, definition in THEOREMS.items():
            kind, thm = declarations[theorem]
            defkind, stmt = declarations[definition]
            require(kind == "thm" and defkind == "def" and operator(thm["type"]) == definition,
                    "Challenge theorem type changed")
            value = stmt["value"]
            binders = []
            domains = []
            while expr(value)[0] == "forallE":
                _, binder = expr(value)
                domains.append(binder["type"])
                binders.append(operator(binder["type"]))
                value = binder["body"]
            require(tuple(binders) == BINDER_HEADS[theorem], "Exported binder heads differ")
            if theorem.endswith("half_lt_re"):
                lower, observed = arguments(domains[-2])[-2:]
                exception = arguments(domains[-1])[-2:]
                require(operator(value) == "Ne" and operator(arguments(value)[-2]) == "DirichletCharacter.LFunction"
                        and integer_literal(arguments(value)[-1]) == 0 and operator(observed) == "Complex.re"
                        and half(lower) and all(operator(term) == "Ne" and
                            integer_literal(arguments(term)[-1]) == 1 for term in exception),
                        "Right-half nonvanishing or pole exception differs")
            else:
                lhs, rhs = arguments(value)[-2:]
                require(operator(value) == "Eq" and operator(lhs) == "Complex.re" and half(rhs),
                        "Conclusion does not equate the real part with one half")
                if theorem.startswith("LFunction"):
                    lower, left_observed = arguments(domains[-3])[-2:]
                    right_observed, upper = arguments(domains[-2])[-2:]
                    require(operator(left_observed) == operator(right_observed) == "Complex.re"
                            and integer_literal(lower) == 0 and integer_literal(upper) == 1,
                            "Critical-strip bounds differ")
            refs = atoms(stmt["value"])
            expected_family = "riemannZeta" if theorem.startswith("riemann") else "DirichletCharacter.LFunction"
            require(expected_family in refs and
                    ("DirichletCharacter.IsPrimitive" in refs) == theorem.endswith("isPrimitive"),
                    "Exported scope differs")
            require("sorryAx" in atoms(thm["value"]), "Challenge proof placeholder changed")
            records[theorem] = dict(type=definition, outer_binder_heads=binders,
                conclusion_head=operator(value), direct_type_constants=sorted(refs),
                local_challenge_has_proof_placeholder=True)
        return dict(bytes=size, meta=meta, expression_count=len(expressions),
                    name_count=len(names)-1, roots=records)


def compare_logs(folder):
    config = json.loads((folder/"comparator.json").read_text())
    require(config["theorem_names"] == list(THEOREMS) and set(config["permitted_axioms"]) == AXIOMS,
            "Comparator theorem or axiom roster differs")
    reported = {}
    for line in (folder/"audit.log").read_text().splitlines():
        match = re.fullmatch(r"'([^']+)' depends on axioms: \[([^\]]+)\]", line)
        if match:
            require(match[1] not in reported, "Repeated theorem in axiom audit")
            reported[match[1]] = set(match[2].split(", "))
    require(reported == dict.fromkeys(THEOREMS, AXIOMS), "Unexpected axiom or theorem in solution audit")
    records = {}
    for name in ("nanoda.log", "con-leche-master.log", "con-leche-compare.log"):
        log = (folder/name).read_text()
        require(log.rstrip().endswith("Exit status: 0"), "Reported checker did not accept")
        peak, = re.findall(r"Maximum resident set size \(kbytes\): (\d+)", log)
        records[name] = {"reported_exit_status": 0, "reported_peak_rss_kib": int(peak)}
        if name == "con-leche-compare.log":
            matches = re.findall(r"^con-leche: theorem (\w+) justified by the solution$", log, re.M)
            require(matches == list(THEOREMS), "Reported statement comparison differs")
            records[name]["accepted_targets"] = matches
        if name == "con-leche-master.log":
            count, = re.findall(r"^con-leche: accepted (\d+) declarations \(--verified\)$", log, re.M)
            records[name]["reported_accepted_declarations"] = int(count)
    rows = (folder/"project-oleans.sha256").read_text().splitlines()
    paths = set()
    for raw in rows:
        match = re.fullmatch(r"([0-9a-f]{64})  (\./[^\n]+\.olean)", raw)
        require(match and match[2] not in paths, "Invalid or duplicate module manifest entry")
        paths.add(match[2])
    require(len(paths) == 175_187 and "./Main.olean" in paths, "Module manifest coverage differs")
    return dict(external_checkers=records, reported_solution_axioms=sorted(AXIOMS),
                listed_compiled_module_paths=len(paths))


def run(folder):
    for filename, expected in PINS.items():
        checked(folder/filename, expected)
    challenge = (folder/"Challenge.lean").read_bytes()
    blob = sha1(f"blob {len(challenge)}\0".encode()+challenge).hexdigest()
    declared = re.findall(rb"^theorem (\w+) : (\w+) := by sorry$", challenge, re.M)
    require(dict((n.decode(), t.decode()) for n, t in declared) == THEOREMS,
            "Community source does not match the configured propositions")
    main = (folder/"Main.lean").read_text()
    submitted = dict(re.findall(r"^theorem (\w+) : (\w+) :=", main, re.M))
    targets = (folder/"export-targets.txt").read_text().splitlines()
    require(submitted == THEOREMS and targets[1].split() == list(THEOREMS)
            and set(targets[2].split()) == AXIOMS, "Submitted declarations or export targets differ")
    require(challenge.startswith((folder/"Statements.lean").read_bytes()),
            "Submitted statement definitions differ from the independent challenge")
    export = exported_scope(folder/"challenge.ndjson")
    return dict(format="phaseweave.november-rh-verification.v1", community_commit=COMMUNITY,
                challenge_lean_blob=blob, checked_sha256=PINS, challenge_export=export,
                submitted_theorem_signatures=THEOREMS,
                published_challenge_byte_count=ADVERTISED_EXPORT_BYTES,
                actual_minus_published_challenge_bytes=export["bytes"] - ADVERTISED_EXPORT_BYTES,
                proof_solution_locally_checked=False, **compare_logs(folder))


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("folder", type=Path)
    cli.add_argument("--output", type=Path, required=True)
    args = cli.parse_args()
    report = run(args.folder)
    with args.output.open("x") as result:
        json.dump(report, result, sort_keys=True, indent=2)
        result.write("\n")
