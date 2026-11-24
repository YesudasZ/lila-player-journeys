# QA report

The full QA before submission, run on 24 Nov 2026 as the user's QA brief asks: test, report, fix, re-test.

- **Production:** https://lila-player-journeys-psi.vercel.app, serving `main` at `abdaf02` (the merge of pull request #8).
- **Method:** Claude in Chrome on fresh tabs. Page state was read from the DOM and from the canvas pixels by scripts; clicks, keys, hovers and drags were real input from the browser tool wherever a row says so. Expected numbers were counted from the committed data files with a separate script, not taken from the app.
- **Previous audit:** [AUDIT.md](AUDIT.md) (24 Nov, read-only). Its results are reused where nothing changed; its open items are re-checked in Group C.
- **Evidence:** screenshots in [docs/qa/](qa/); numbers and texts as read from the page.
- **Result key:** PASS, PARTIAL, FAIL. "Observation" marks something that works but deserves a note.

<!-- SUMMARY -->

## Step 0: state

| Check | Result | Evidence |
|---|---|---|
| Pull request #8 merged | PASS | Merged by the user at 15:35 UTC as `abdaf02`; CI on `abdaf02` green |
| Production serves the latest `main` | PASS | The Vercel status on `abdaf02` reads "Deployment has completed". The served page names `index-CKbSPsBA.js` and `index-DyQpQSEB.css`, the files a local build of `abdaf02` gives, and all 8 served data files are byte-identical to `main`'s. Reading the deployment record through Vercel's API needs a team authorization that was not requested |

## Group A: the brief's core requirements

| ID | Requirement | Steps | Expected | Actual | Result | Evidence |
|---|---|---|---|---|---|---|
| A1 | Loads in a fresh tab without login, no console error, no failed request | Fresh tab, console tracking on, reload | The tool, no login, nothing failed | Opens on Ambrose Valley; no sign-in text; 10 requests, none failed; no console message. First byte 47 ms, DOM ready 167 ms, load 210 ms | PASS | Timings from the navigation entry |
| A2 | Data totals: 796 matches, 1,242 journeys, per-map counts | Read the tabs and each map's legend | 566/836, 59/111, 171/295 and the data files' row counts | Tabs 566 / 59 / 171. Legends "566 matches, 836 journeys", "59 matches, 111 journeys", "171 matches, 295 journeys". Rows: Humans 568 / 59 / 171, Bots 268 / 52 / 124, Kills 1,789 / 192 / 425, Deaths 487 / 47 / 166, Storm deaths 17 / 5 / 17, Loot 9,902 / 880 / 2,047 | PASS | All equal to the separate count |
| A3 | Journeys on the correct minimap of each map | Screenshot of each map, compared with `docs/img/overlay_*.jpg` | Same orientation and placement, paths on roads | All three match their proof image: Ambrose Valley's outline and dense centre, Grand Rift's labelled areas (Maintenance Bay, Mine Pit, Engineer's Quarters, Gas Station), Lockdown's sea, bridges and compounds | PASS (by eye) | [a3-ambrose-valley.jpg](qa/a3-ambrose-valley.jpg), [a3-grand-rift.jpg](qa/a3-grand-rift.jpg), [a3-lockdown.jpg](qa/a3-lockdown.jpg) |
| A4 | Humans and bots distinct by colour and by style or shape; legend matches | Match `fbbc5d02`; legend samples; canvas colours | Two colours, two line styles, two head shapes | Humans: solid `#56B4E9` lines, round heads (3,414 px). Bots: dashed `#E69F00` lines, square heads (40,064 px). Legend samples: line + circle, line + square | PASS | [a5-loot-tooltip.jpg](qa/a5-loot-tooltip.jpg) shows both |
| A5 | Kill, death, loot and storm markers distinct; tooltips give type, who, time, place | Pointer on one marker of each kind in `fbbc5d02` and on the storm death of `16d42f47` | Each tooltip names event, who, time, x and z | "Kill / bot 1440 / at 1:28 · x 111 z 69 · elevation 105"; "Death: killed / bot 1481 / at 8:10 · x −103 z −14 …"; "Loot × 2 / human (no account id) / at 1:53 to 1:54 · x −53 z −357 …"; "Storm death / human a0738c7c / at 13:22 · x 282 z 110 · elevation 39"; paths: "bot 1458 / no death recorded / at 6:07 …". Triangle, cross, ring, diamond | PASS | Pointer events scripted here; real hovers in C2 |
| A6 | Filters: map, day, match, fate, humans and bots switches; list, legend and map update together | Lockdown; "10 Feb"; fate "killed by storm"; Bots off; Humans off; a match; "Clear filters" | The data files' counts in every state | 10 Feb: "61 matches, 94 journeys", tabs 199 / 24 / 61, Kills 199, Deaths 54, Storm 7, Loot 882. Storm fate: "7 matches, 7 journeys", Kills 19. Bots off: Kills 190, Deaths 30. Humans off: Kills 9, Deaths 24, Loot 0. Match `413b9011`: "1 match, 14 journeys" as its row says. Cleared: 171 / 295. The address followed each step | PARTIAL | With Bots or Humans off the legend's first line still reads "61 matches, 94 journeys", and the Humans and Bots rows keep their counts; the markers and the heat follow the switches (heat: 724 kills, 669 with bots off) |
| A7 | Playback: play, pause, all speeds, scrub, Home, End, arrows; markers on time; death marker at the path's end | `fbbc5d02`: slider set to 0, 60, 117, 118, 240, 523 s; each speed for 1 s; Pause; real keys; one journey (`fate=killed_by_bot`) at 110, 118, 523 s | Paths grow; the first death at 1:58; each speed as labelled; keys 5 s, 1 s, 60 s, ends | Opens whole at "8:43 / 8:43". Drawn pixels 830, 22,003, 36,814, 37,500, 54,330, 75,640; death colour 0 at 1:57 and 185 at 1:58. Per real second: 1.0, 2.0, 5.1, 10.2, 20.3, 61.0 s at 1x to 60x. Pause holds. Keys: Home 0, → 5, → 10, Shift+→ 11, Page Up 71, Page Down 11, End 523, ← 518. One journey: no cross at 110 s, the cross at 118 s 6.3 px from the path's end, the path not growing after it | PASS | Keys were real key presses |
| A8 | Heat: Traffic, Kills, Deaths, Loot on every map; legend numbers follow the filters | 12 pairs of map and layer; then 10 Feb, then Bots off; then off | The data files' counts | AV 48,436 samples / 566 matches; 1,789 kills / 441; 504 deaths / 338 incl. 17 storm; 9,902 loot / 539. GR 5,711 / 59; 192 / 42; 52 / 33 incl. 5; 880 / 55. LD 18,496 / 171; 425 / 122; 183 / 102 incl. 17; 2,047 / 143. 10 Feb: 724 kills / 152; Bots off: 669 / 148. Off: nothing painted | PASS | All equal to the separate count |
| A9 | Copy link opens the identical view in a new tab | View with day, match, time, focused journey, hidden loot, fate, heat, zoom; real click on "Copy link"; new tab; the clipboard's address opened there | Same view | "Link copied". The clipboard held an address of the site with 8 parameters; opened in the new tab it showed "1 match, 1 journey", "1:58 / 8:43", "1 death of 1 match", the same six pressed controls and legend rows, and kept the address | PASS | Canvas pixels differ only by the tabs' heights (835 and 779 px) |

Console and network in Group A: no console message in any tab, no failed request.
