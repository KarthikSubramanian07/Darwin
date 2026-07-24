"""Pipeline: turn an industry into runnable tasks + synthetic eval cases (Lane A).

industry --decompose--> [TaskSpec] --synth--> cases --build--> Task (data/task/<industry>.json)

Fireworks (JSON mode) drives the live path; a curated offline library (pipeline/industries.py)
is the fallback and the honest demo library. Either way the output is a standard `Task` the
existing engine + Braintrust fitness + Daytona sandboxes run unchanged.
"""
