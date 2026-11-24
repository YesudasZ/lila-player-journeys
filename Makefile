# Offline data tasks. The raw data is not in git: unzip player_data.zip into data/raw/ first.
PY   := .venv/bin/python
RAW  := data/raw/player_data
VENV := .venv/.installed

.PHONY: help setup data profile overlay insights test

help:     ## list these targets
	@awk -F ':.*## ' '/^[a-z]+:.*## / {printf "make %-8s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# The environment is created on first use and again whenever the pinned versions change.
$(VENV): pipeline/requirements.txt
	@python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else "Python 3.12 or newer is needed; python3 is " + sys.version.split()[0])'
	python3 -m venv .venv
	$(PY) -m pip install -r pipeline/requirements.txt
	@touch $@

setup: $(VENV)    ## create .venv and install the pipeline dependencies

data: $(VENV)     ## build the app's data files -> web/public/data/; nothing is written unless every check passes
	$(PY) -m pipeline.build_data --raw $(RAW) --out web/public/data --fixtures web/src/lib/__fixtures__ --profile docs/profile/profile_report.json

profile: $(VENV)  ## measure the raw data -> docs/profile/profile_report.{json,md}
	$(PY) -m pipeline.profile_data --raw $(RAW) --out docs/profile

overlay: $(VENV)  ## draw the coordinate-mapping proof images -> docs/img/
	$(PY) -m pipeline.verify_overlay --raw $(RAW) --out docs/img

insights: $(VENV) ## print the statistics behind INSIGHTS.md, from the committed data files (no raw data needed)
	$(PY) -m analysis.insights

test: $(VENV)     ## run the tests (no raw data needed)
	$(PY) -m pytest -q
