(function () {
  'use strict';

  const STATE_ABBREV = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
    OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
  };

  const STATE_NAME_TO_ABBREV = (function () {
    const m = {};
    for (const ab in STATE_ABBREV) m[STATE_ABBREV[ab]] = ab;
    return m;
  })();

  function stateAbbrev(stateName) {
    return STATE_NAME_TO_ABBREV[stateName] || stateName;
  }

  function countyResultLine(m) {
    return m.countyName + ', ' + stateAbbrev(m.stateName);
  }

  const FUZZY_THRESHOLD = 0.8;

  let stateByCode = {};
  let countyByFips = {};
  let countiesList = [];
  let fipsByName = {};

  function normalizeCounty(name) {
    if (!name || typeof name !== 'string') return '';
    return name.trim().toLowerCase().replace(/\s+county\s*$/i, '').trim();
  }

  function normalizeStateInput(input) {
    if (!input || typeof input !== 'string') return '';
    const trimmed = input.trim();
    if (trimmed.length === 2) {
      const full = STATE_ABBREV[trimmed.toUpperCase()];
      if (full) return full;
    }
    return trimmed;
  }

  function stateKey(stateName) {
    return stateName.toLowerCase().trim();
  }

  function buildLookupKey(countyNorm, stateNorm) {
    return countyNorm + '|' + stateKey(stateNorm);
  }

  function buildData(rows) {
    stateByCode = {};
    countyByFips = {};
    countiesList = [];
    fipsByName = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2) continue;
      const fips = String(row[0]).trim();
      const name = String(row[1]).trim();
      if (!fips || !name) continue;

      const isStateRow = fips.length >= 3 && fips.slice(-3) === '000';
      const stateCode = fips.length >= 2 ? fips.slice(0, 2) : '';

      if (isStateRow) {
        stateByCode[stateCode] = name;
        continue;
      }

      const stateName = stateByCode[stateCode] || '';
      countyByFips[fips] = { countyName: name, stateName: stateName };

      const countyNorm = normalizeCounty(name);
      const key = buildLookupKey(countyNorm, stateName);
      fipsByName[key] = fips;

      countiesList.push({ fips: fips, countyName: name, stateName: stateName });
    }
  }

  function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = 1 + Math.min(
            matrix[i - 1][j - 1],
            matrix[i][j - 1],
            matrix[i - 1][j]
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    const sa = String(a).toLowerCase();
    const sb = String(b).toLowerCase();
    if (sa === sb) return 1;
    const maxLen = Math.max(sa.length, sb.length);
    if (maxLen === 0) return 1;
    const dist = levenshtein(sa, sb);
    return 1 - dist / maxLen;
  }

  function lookupByFips(input) {
    const digits = input.replace(/\D/g, '');
    if (digits.length === 2) {
      const stateCode = digits.padStart(2, '0');
      const stateName = stateByCode[stateCode];
      if (stateName) return { type: 'state', stateName: stateName };
      return { type: 'error', message: 'Invalid FIPS code.' };
    }
    if (digits.length === 5) {
      const fips = digits.padStart(5, '0');
      const rec = countyByFips[fips];
      if (rec) return { type: 'county', matches: [{ countyName: rec.countyName, stateName: rec.stateName, fips: fips }], exact: true };
      return { type: 'error', message: 'Invalid FIPS code.' };
    }
    return { type: 'error', message: 'Enter 2 digits for state or 5 digits for county.' };
  }

  function exactNameLookup(countyInput, stateInput) {
    const stateNorm = normalizeStateInput(stateInput);
    if (!stateNorm) return null;
    const countyNorm = normalizeCounty(countyInput);
    if (!countyNorm) return null;
    const key = buildLookupKey(countyNorm, stateNorm);
    const fips = fipsByName[key];
    if (!fips) return null;
    const rec = countyByFips[fips];
    return { exact: true, matches: [{ countyName: rec.countyName, stateName: rec.stateName, fips: fips }] };
  }

  function fuzzyNameLookup(countyInput, stateInput) {
    const stateNorm = normalizeStateInput(stateInput);
    const countyNorm = normalizeCounty(countyInput);
    if (!countyNorm && !stateNorm) return [];

    const stateKeyNorm = stateNorm ? stateKey(stateNorm) : '';
    const candidates = [];

    for (let i = 0; i < countiesList.length; i++) {
      const c = countiesList[i];
      const cCountyNorm = normalizeCounty(c.countyName);
      const cStateKey = stateKey(c.stateName);

      let stateScore = 1;
      if (stateKeyNorm) {
        stateScore = similarity(stateNorm, c.stateName);
        if (stateScore < FUZZY_THRESHOLD) continue;
      }

      const countyScore = countyNorm ? similarity(countyNorm, cCountyNorm) : 0;
      if (countyNorm && countyScore < FUZZY_THRESHOLD) continue;
      const combined = stateKeyNorm && countyNorm
        ? (stateScore + countyScore) / 2
        : (stateKeyNorm ? stateScore : countyScore);
      if (combined < FUZZY_THRESHOLD) continue;

      candidates.push({ score: combined, countyName: c.countyName, stateName: c.stateName, fips: c.fips });
    }

    candidates.sort(function (a, b) { return b.score - a.score; });
    const seen = new Set();
    return candidates.filter(function (c) {
      const k = c.fips;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).map(function (c) { return { countyName: c.countyName, stateName: c.stateName, fips: c.fips }; });
  }

  function lookupAllCountiesInState(stateInput) {
    const stateNorm = normalizeStateInput(stateInput);
    if (!stateNorm) return null;
    const sk = stateKey(stateNorm);
    const matches = [];
    for (let i = 0; i < countiesList.length; i++) {
      const c = countiesList[i];
      if (stateKey(c.stateName) === sk) {
        matches.push({ countyName: c.countyName, stateName: c.stateName, fips: c.fips });
      }
    }
    if (matches.length === 0) return null;
    matches.sort(function (a, b) {
      return a.countyName.localeCompare(b.countyName, undefined, { sensitivity: 'base' });
    });
    return matches;
  }

  function stateNameToTwoDigitFips(stateNorm) {
    if (!stateNorm) return null;
    const sk = stateKey(stateNorm);
    for (const code in stateByCode) {
      if (Object.prototype.hasOwnProperty.call(stateByCode, code) && stateKey(stateByCode[code]) === sk) {
        return String(code).padStart(2, '0');
      }
    }
    return null;
  }

  function countyMatchesListHtml(matches) {
    let html = '<ul class="result-list">';
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const line = countyResultLine(m);
      html += '<li class="result-item">' +
        '<span class="result-item-text">' + escapeHtml(line) +
        ' — FIPS: ' + escapeHtml(m.fips) + '</span>' +
        ' <button type="button" class="copy-btn copy-btn-inline" data-copy="' +
        escapeAttr(m.fips) + '">Copy FIPS</button></li>';
    }
    html += '</ul>';
    return html;
  }

  function lookupByName(countyInput, stateInput) {
    const countyTrim = countyInput && String(countyInput).trim();
    const stateTrim = stateInput && String(stateInput).trim();
    if (!stateTrim) {
      return { type: 'error', message: 'Enter state name or abbreviation.' };
    }

    if (!countyTrim) {
      const stateNorm = normalizeStateInput(stateTrim);
      const allInState = lookupAllCountiesInState(stateTrim);
      if (!allInState) {
        return { type: 'error', message: 'No match found for that state.' };
      }
      const fips2 = stateNameToTwoDigitFips(stateNorm);
      if (!fips2) {
        return { type: 'error', message: 'No match found for that state.' };
      }
      return {
        type: 'stateFipsPicker',
        stateName: stateNorm,
        stateFips: fips2,
        countyMatches: allInState
      };
    }

    const exact = exactNameLookup(countyTrim, stateTrim);
    if (exact) return { type: 'name', exact: true, matches: exact.matches };

    const fuzzyMatches = fuzzyNameLookup(countyTrim, stateTrim);
    if (fuzzyMatches.length > 0) {
      return { type: 'name', exact: false, matches: fuzzyMatches };
    }
    return { type: 'error', message: 'No match found.' };
  }

  function renderResult(result) {
    const el = document.getElementById('result');
    const loading = document.getElementById('loading');
    const errEl = document.getElementById('error');
    loading.hidden = true;
    errEl.hidden = true;
    errEl.textContent = '';

    if (!result) {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }

    el.hidden = false;

    if (result.type === 'error') {
      el.innerHTML = '<p class="result-message result-error">' + escapeHtml(result.message) + '</p>';
      return;
    }

    if (result.type === 'state') {
      el.innerHTML = '<p class="result-message result-success">State: ' + escapeHtml(result.stateName) + '</p>' +
        '<button type="button" class="copy-btn" data-copy="' + escapeAttr(result.stateName) + '">Copy</button>';
      return;
    }

    if (result.type === 'stateFipsPicker') {
      const line = result.stateName + ', ' + stateAbbrev(result.stateName);
      const fips2 = String(result.stateFips).padStart(2, '0');
      let html = '';
      html += '<p class="result-message result-success result-one-line">' + escapeHtml(line) + '</p>';
      html += '<p class="result-fips result-fips-bold">FIPS: ' + escapeHtml(fips2) + '</p>';
      html += '<button type="button" class="copy-btn" data-copy="' + escapeAttr(fips2) + '">Copy FIPS</button>';
      html += '<div class="state-fips-expand-block">';
      html += '<button type="button" class="show-state-counties-btn">Show FIPS codes for all ' +
        escapeHtml(result.stateName) + ' counties</button>';
      html += '<div class="state-counties-panel" hidden>';
      html += '<p class="result-sub state-counties-heading">Counties in ' + escapeHtml(result.stateName) + '</p>';
      html += countyMatchesListHtml(result.countyMatches);
      html += '</div></div>';
      el.innerHTML = html;
      return;
    }

    if (result.type === 'county' || result.type === 'name') {
      const exact = result.exact !== false;
      const multiple = result.matches && result.matches.length > 1;
      let html = '';

      if (!exact && multiple) {
        html += '<p class="result-reminder">Your search did not match exactly. Multiple close matches found.</p>';
      } else if (!exact) {
        html += '<p class="result-reminder">Your search did not match exactly.</p><p class="result-sub">Closest match(es):</p>';
      } else if (multiple) {
        html += '<p class="result-reminder">Multiple matches found.</p>';
      }

      if (result.matches.length === 1 && exact && !multiple) {
        const m = result.matches[0];
        const line = countyResultLine(m);
        html += '<p class="result-message result-success result-one-line">' + escapeHtml(line) + '</p>';
        if (result.type === 'name') {
          html += '<p class="result-fips result-fips-bold">FIPS: ' + escapeHtml(m.fips) + '</p>';
          html += '<button type="button" class="copy-btn" data-copy="' + escapeAttr(m.fips) + '">Copy FIPS</button>';
        } else {
          html += '<button type="button" class="copy-btn" data-copy="' + escapeAttr(line) + '">Copy</button>';
        }
      } else {
        html += '<ul class="result-list">';
        for (let i = 0; i < result.matches.length; i++) {
          const m = result.matches[i];
          const line = countyResultLine(m);
          const showFips = result.type === 'name';
          html += '<li class="result-item">' +
            '<span class="result-item-text">' + escapeHtml(line) +
            (showFips ? ' — FIPS: ' + escapeHtml(m.fips) : '') + '</span>' +
            ' <button type="button" class="copy-btn copy-btn-inline" data-copy="' +
            escapeAttr(showFips ? m.fips : line) + '">' +
            (showFips ? 'Copy FIPS' : 'Copy') + '</button></li>';
        }
        html += '</ul>';
      }
      el.innerHTML = html;
      return;
    }

    el.innerHTML = '';
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function bindCopyButtons(container) {
    if (!container) return;
    container.querySelectorAll('.copy-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const text = this.getAttribute('data-copy');
        if (!text) return;
        const prev = btn.textContent;
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = 'Copied!';
          setTimeout(function () { btn.textContent = prev; }, 1500);
        });
      });
    });
  }

  function bindStateCountiesExpand(container) {
    if (!container) return;
    const expandBtn = container.querySelector('.show-state-counties-btn');
    const panel = container.querySelector('.state-counties-panel');
    if (!expandBtn || !panel) return;
    expandBtn.addEventListener('click', function () {
      panel.hidden = false;
      expandBtn.hidden = true;
    });
  }

  function bindResultInteractions(container) {
    bindCopyButtons(container);
    bindStateCountiesExpand(container);
  }

  let currentMode = null;

  function clearResultView() {
    const el = document.getElementById('result');
    el.innerHTML = '';
    el.hidden = true;
  }

  function clearAllInputs() {
    const fips = document.getElementById('fips-input');
    const county = document.getElementById('county-input');
    const state = document.getElementById('state-input');
    if (fips) fips.value = '';
    if (county) county.value = '';
    if (state) state.value = '';
  }

  function setFormFieldsActiveMode(mode) {
    const fipsInput = document.getElementById('fips-input');
    const countyInput = document.getElementById('county-input');
    const stateInput = document.getElementById('state-input');
    if (!fipsInput || !countyInput || !stateInput) return;
    if (mode === 'fips') {
      fipsInput.disabled = false;
      countyInput.disabled = true;
      stateInput.disabled = true;
    } else if (mode === 'name') {
      fipsInput.disabled = true;
      countyInput.disabled = false;
      stateInput.disabled = false;
    } else {
      fipsInput.disabled = true;
      countyInput.disabled = true;
      stateInput.disabled = true;
    }
  }

  function showModePicker() {
    currentMode = null;
    document.getElementById('mode-picker').hidden = false;
    document.getElementById('search-workflow').hidden = true;
    document.getElementById('panel-fips').hidden = true;
    document.getElementById('panel-name').hidden = true;
    setFormFieldsActiveMode(null);
    clearAllInputs();
    clearResultView();
  }

  function showWorkflow(mode) {
    currentMode = mode;
    document.getElementById('mode-picker').hidden = true;
    document.getElementById('search-workflow').hidden = false;
    const panelFips = document.getElementById('panel-fips');
    const panelName = document.getElementById('panel-name');
    if (mode === 'fips') {
      panelFips.hidden = false;
      panelName.hidden = true;
      clearResultView();
      setFormFieldsActiveMode('fips');
      const input = document.getElementById('fips-input');
      if (input) input.focus();
    } else if (mode === 'name') {
      panelFips.hidden = true;
      panelName.hidden = false;
      clearResultView();
      setFormFieldsActiveMode('name');
      const input = document.getElementById('county-input');
      if (input) input.focus();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!currentMode) return;
    const fipsVal = document.getElementById('fips-input').value.trim();
    const countyVal = document.getElementById('county-input').value.trim();
    const stateVal = document.getElementById('state-input').value.trim();

    let result = null;
    if (currentMode === 'fips') {
      if (!fipsVal) {
        result = { type: 'error', message: 'Enter a FIPS code (2 or 5 digits).' };
      } else {
        result = lookupByFips(fipsVal);
      }
    } else if (currentMode === 'name') {
      result = lookupByName(countyVal, stateVal);
    }

    renderResult(result);
    bindResultInteractions(document.getElementById('result'));
  }

  function init() {
    const loading = document.getElementById('loading');
    const errEl = document.getElementById('error');
    loading.hidden = false;
    errEl.hidden = true;

    fetch('data/fips_lookup.json?v=1')
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load data');
        return r.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || data.length < 1) throw new Error('Invalid data');
        buildData(data);
        loading.hidden = true;
        document.getElementById('mode-picker').hidden = false;

        document.getElementById('search-form').addEventListener('submit', handleSubmit);

        document.querySelectorAll('.mode-choice').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const mode = btn.getAttribute('data-mode');
            if (mode === 'fips' || mode === 'name') showWorkflow(mode);
          });
        });

        document.getElementById('back-to-modes').addEventListener('click', function () {
          showModePicker();
        });
      })
      .catch(function (err) {
        loading.hidden = true;
        errEl.textContent = err.message || 'Failed to load FIPS data.';
        errEl.hidden = false;
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
