#!/usr/bin/env python3
"""Unit tests for tools/oura_csv_import.py -- the mapping, the ownership
rule, and the zero-stage anomaly, without touching real health data."""
import io, json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import oura_csv_import as m

CSV_HEADER = ("date,Bedtime End,Average Resting Heart Rate,Average HRV,"
              "Bedtime Start,Sleep Score,Deep Sleep Duration,REM Sleep Duration,"
              "Lowest Resting Heart Rate,Light Sleep Duration\n")


def write_csv(rows):
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="")
    f.write(CSV_HEADER)
    f.writelines(rows)
    f.close()
    return f.name


class TestReadings(unittest.TestCase):
    def test_full_row_maps_every_field(self):
        path = write_csv(["11/4/2025,2025-11-04T04:15:05.000-06:00,74.36,34,"
                           "2025-11-03T21:00:29.000-06:00,65,41,64,62,4.3\n"])
        warn = []
        out, thin = m.readings(path, warn)
        os.unlink(path)
        rec = out["2025-11-04"]
        self.assertEqual(rec["sleep"], 65)
        self.assertEqual(rec["hrv"], 34)
        self.assertEqual(rec["hr"], 62, "hr is the LOWEST reading, matching oura_sync.py's convention")
        self.assertEqual(rec["avgHr"], 74, "avgHr is the average, a distinct field from hr")
        self.assertEqual(rec["deepSleep"], 41)
        self.assertEqual(rec["remSleep"], 64)
        self.assertEqual(rec["lightSleep"], 258, "4.3 hours -> 258 minutes, converted to match deep/REM's unit")
        self.assertEqual(rec["bed"], "21:00")
        self.assertEqual(rec["wake"], "04:15")
        self.assertEqual(thin, [])
        self.assertEqual(warn, [])

    def test_zero_stage_score_only_row_is_flagged_and_thinned(self):
        path = write_csv(["3/15/2026,,,,,38,0,0,,0.0\n"])
        out, thin = m.readings(path, [])
        os.unlink(path)
        self.assertEqual(out["2026-03-15"], {"sleep": 38},
                          "no fabricated zero-minute stages sit beside a real score")
        self.assertEqual(thin, ["2026-03-15"])

    def test_a_real_zero_duration_with_other_fields_present_is_kept(self):
        # deep sleep of 0 min is plausible on a bad night IF the rest of the
        # record is real; only the all-blank-except-score row is an anomaly
        path = write_csv(["1/1/2026,2026-01-01T04:00:00.000-06:00,70,30,"
                           "2026-01-01T00:22:22.000-06:00,50,0,46,58,3.7\n"])
        out, thin = m.readings(path, [])
        os.unlink(path)
        self.assertEqual(out["2026-01-01"]["deepSleep"], 0)
        self.assertEqual(thin, [])

    def test_out_of_range_is_clamped_and_warned(self):
        path = write_csv(["1/2/2026,2026-01-02T04:00:00.000-06:00,200,30,"
                           "2026-01-01T22:00:00.000-06:00,50,10,40,20,3\n"])
        warn = []
        out, _ = m.readings(path, warn)
        os.unlink(path)
        self.assertEqual(out["2026-01-02"]["avgHr"], 125)
        self.assertEqual(out["2026-01-02"]["hr"], 35)
        self.assertTrue(any("clamped" in w for w in warn))

    def test_duplicate_date_keeps_the_first_row(self):
        path = write_csv([
            "1/3/2026,2026-01-03T04:00:00.000-06:00,60,30,2026-01-02T22:00:00.000-06:00,70,20,50,55,4\n",
            "1/3/2026,2026-01-03T05:00:00.000-06:00,99,99,2026-01-02T23:00:00.000-06:00,99,99,99,99,9\n",
        ])
        warn = []
        out, _ = m.readings(path, warn)
        os.unlink(path)
        self.assertEqual(out["2026-01-03"]["sleep"], 70)
        self.assertTrue(any("duplicate" in w for w in warn))


class TestMerge(unittest.TestCase):
    def test_new_day_gets_every_field_and_is_flagged_owned(self):
        seed = {"days": {}}
        ring = {"2026-01-04": {"sleep": 70, "hr": 55, "avgHr": 65}}
        seed, changes, skipped = m.merge(seed, ring)
        rec = seed["days"]["2026-01-04"]
        self.assertEqual((rec["sleep"], rec["hr"], rec["avgHr"]), (70, 55, 65))
        self.assertEqual(sorted(rec["_o"]), ["avgHr", "hr", "sleep"])
        self.assertEqual(len(changes), 3)
        self.assertEqual(skipped, [])

    def test_hand_typed_value_is_never_overwritten(self):
        seed = {"days": {"2026-01-05": {"bed": "22:15"}}}   # no _o -- typed by hand
        ring = {"2026-01-05": {"bed": "22:00", "sleep": 60}}
        seed, changes, skipped = m.merge(seed, ring)
        rec = seed["days"]["2026-01-05"]
        self.assertEqual(rec["bed"], "22:15", "the hand-typed bed time survives")
        self.assertEqual(rec["sleep"], 60, "a field the day never had is still filled in")
        self.assertTrue(any("bed" in s for s in skipped))

    def test_a_prior_ring_value_can_be_corrected_by_a_newer_run(self):
        seed = {"days": {"2026-01-06": {"sleep": 60, "_o": ["sleep"]}}}
        ring = {"2026-01-06": {"sleep": 63}}
        seed, changes, skipped = m.merge(seed, ring)
        self.assertEqual(seed["days"]["2026-01-06"]["sleep"], 63,
                          "a field the ring owns can be corrected by the ring")
        self.assertEqual(skipped, [])

    def test_overwrite_flag_replaces_a_hand_typed_value(self):
        seed = {"days": {"2026-01-08": {"bed": "22:15"}}}
        ring = {"2026-01-08": {"bed": "22:00", "sleep": 60}}
        seed, changes, skipped = m.merge(seed, ring, overwrite=True)
        rec = seed["days"]["2026-01-08"]
        self.assertEqual(rec["bed"], "22:00", "overwrite=True lets the CSV win even here")
        self.assertEqual(rec["sleep"], 60)
        self.assertEqual(skipped, [], "nothing is reported as skipped when overwrite is on")
        self.assertIn("bed", rec["_o"], "the overwritten field is now ring-owned")

    def test_a_cpap_only_day_keeps_cpap_and_gains_the_rest(self):
        seed = {"days": {"2026-01-07": {"cpap": 82}}}
        ring = {"2026-01-07": {"sleep": 70, "hr": 55}}
        seed, changes, skipped = m.merge(seed, ring)
        rec = seed["days"]["2026-01-07"]
        self.assertEqual(rec["cpap"], 82, "the CPAP import is untouched")
        self.assertEqual((rec["sleep"], rec["hr"]), (70, 55))


if __name__ == "__main__":
    unittest.main(verbosity=2)
