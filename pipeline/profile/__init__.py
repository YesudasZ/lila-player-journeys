"""The profiler of the raw telemetry, run by pipeline/profile_data.py.

report.py runs the sections in the report's order. A section is a function
from the loaded rows to a pair: its metrics (named values) and its details
(the tables behind them). The sections live in files, actors, timestamps (with
sampling), matches, quality, combat, coordinates and cleaning; each of these
modules starts with DEFINITIONS, the exact definition of every metric it
measures. metrics.py collects the metrics, values.py says how a value is
written, and render.py turns the report into markdown.
"""
