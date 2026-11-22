# Offline data tasks. The raw data is not in git: unzip player_data.zip into data/raw/ first.
PY  := .venv/bin/python
RAW := data/raw/player_data

.PHONY: setup profile overlay test

setup:    ## create .venv and install the pipeline dependencies
	python3 -m venv .venv
	$(PY) -m pip install -r pipeline/requirements.txt

profile:  ## measure the raw data -> docs/profile/profile_report.{json,md}
	$(PY) -m pipeline.profile_data --raw $(RAW) --out docs/profile

overlay:  ## draw the coordinate-mapping proof images -> docs/img/
	$(PY) -m pipeline.verify_overlay --raw $(RAW) --out docs/img

test:     ## unit tests (no raw data needed)
	$(PY) -m pytest -q
