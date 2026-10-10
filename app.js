const $ = (id) => document.getElementById(id);
const fields = ['hours', 'wind', 'sea', 'wave', 'swellHeight', 'windWaveHeight'];

function normalizeClause(text) {
  const numberWords = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12' };
  return text.replace(/[\u2018\u2019\u201c\u201d]/g, '"').replace(/[\u00a0\u200b]/g, ' ').replace(/,/g, ' ').toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, (word) => numberWords[word]);
}
function findNumber(patterns, text) {
  for (const pattern of patterns) { const match = text.match(pattern); if (match) return Number(match[1]); }
  return null;
}
function findContinuousHours(text) {
  // Keep the number tied to an hours unit; accept the continuity keyword on either side.
  return findNumber([
    /(\d+(?:\.\d+)?)\s*(?:consecutive|continuous)\s*(?:hours?|hrs?)\b/,
    /(?:consecutive|continuous)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/,
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b\s*(?:of\s+)?(?:consecutive|continuous)\b/,
    /(?:consecutive|continuous)\b[^.;!?]{0,40}?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/,
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b[^.;!?]{0,40}?\b(?:consecutive|continuous)\b/,
    /prevail[\s\S]{0,160}?(?:over\s+)?(?:a\s+)?period\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/,
    /prevail[\s\S]{0,160}?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/
  ], text);
}
function findHeightAround(text, keywordSource) {
  const unitNumber = '(?:max(?:imum)?\\s*)?(\\d+(?:\\.\\d+)?)\\s*(?:m|met(?:er|re)s?)';
  const afterKeyword = new RegExp(`${keywordSource}[\\s\\S]{0,60}?${unitNumber}`, 'i');
  const beforeKeyword = new RegExp(`${unitNumber}[\\s\\S]{0,60}?${keywordSource}`, 'i');
  const match = text.match(afterKeyword) ?? text.match(beforeKeyword);
  return match ? Number(match[1]) : null;
}
function matchesNoCurrentFactor(text) {
  const explicit = [/no\s+current\s+factor/, /net\s+current\s+factor\s+(?:is\s+)?not\s+to\s+apply/, /no\s+averaging\s+currents?\s+to\s+calculate\s+daily\s+cf/, /steaming\s+days?[\s\S]{0,180}adverse\s+currents?[\s\S]{0,180}not\s+to\s+be\s+included/].some((pattern) => pattern.test(text));
  const noonToNoonDay = /good\s+weather\s+days?/.test(text) && /noon\s+to\s+noon/.test(text) && /(?:all\s+parts?|all\s+(?:6\s*[- ]?hourly\s+)?periods?|6\s*[- ]?hourly\s+periods?)[\s\S]{0,100}(?:comply|compliance|criteria)/.test(text);
  const continuousPeriod = /good\s+weather\s+period[\s\S]{0,180}\d+\s*hours?[\s\S]{0,100}noon\s+to\s+noon[\s\S]{0,180}(?:continuously|entire\s+period)[\s\S]{0,100}(?:criteria|comply)/.test(text);
  return explicit || noonToNoonDay || continuousPeriod;
}
function matchesNoExtrapolation(text) {
  // Line wrapping does not end a clause; sentence/semicolon boundaries do.
  const segments = text.split(/[;.!?]+/);
  const invalidClause = segments.some((segment) =>
    /\bextrapolations?\b/i.test(segment) &&
    /\bweather[\s-]+conditions?\b/i.test(segment) &&
    /\b(?:described|defined|specified|stated|set\s+out)\s+above\b/i.test(segment)
  );
  if (invalidClause) return false;
  return /\bextrapolations?\b|\bdidymi\s+principle\s+(?:is\s+)?not\s+to\s+apply\b/i.test(text);
}
function updateTimeWindow(hours, fullyCompliant) {
  const value = Number(hours) || 1;
  $('hours').value = value;
  $('complianceValue').textContent = fullyCompliant ? '100%' : '50%';
  $('windowValue').textContent = `${value}h`;
}
function setWaveMode(mode) {
  const significant = mode === 'significant';
  $('sigWaveSwitch').checked = significant;
  $('swellSwitch').checked = !significant;
  $('windWaveSwitch').checked = !significant;
  setWaveHeightState('wave', significant);
  setWaveHeightState('swellHeight', !significant);
  setWaveHeightState('windWaveHeight', !significant);
}
function setWaveHeightState(id, active) {
  const input = $(id);
  input.disabled = !active;
  input.closest('label').classList.toggle('inactive', !active);
}
function updateWaveControls(source) {
  if (source === 'significant') setWaveMode($('sigWaveSwitch').checked ? 'significant' : 'component');
  else if (source === 'component') setWaveMode($('swellSwitch').checked || $('windWaveSwitch').checked ? 'component' : 'significant');
  else setWaveMode($('sigWaveSwitch').checked ? 'significant' : 'component');
}
function extractPerformanceNotes(rawText) {
  const performanceTerms = /\b(?:speed|knots?|kts?|consumption|consume|vlsfo|lsmgo|bunker|ballast|laden|eco|full|other|abt|about)\b/i;
  const excludedContext = /\b(?:port(?:s)?|entering|leaving|maneuv(?:er|r)ing|manoeuvring|exchange\s+of\s+ballast|shallow\s+water|channels?|narrow\s+waterways?|hold\s+cleaning|poor\s+visibility|heavy\s+traffic|low\s+load|load\s+change|incinerator|generator)\b/i;
  const nonWarrantyContext = /\b(?:gain\s+on\s+time|off-?set\s+against\s+loss)\b/i;
  const sentences = rawText.split(/(?:\r?\n+|;)+|(?<=[.!?])\s+(?=[A-Z“‘'])/).map((sentence) => sentence.trim()).filter(Boolean);
  return sentences.filter((sentence) => performanceTerms.test(sentence) && !excludedContext.test(sentence) && !nonWarrantyContext.test(sentence)).join('\n');
}
function parseAbout(rawText) {
  const text = normalizeClause(rawText);
  const clauses = text.split(/[;!?]|\.(?!\d)/).filter((part) => /\b(?:abt|about|tolerance|tollerance)\b/.test(part));
  let speed = null;
  let fuel = null;
  for (const clause of clauses) {
    const both = clause.match(/\bboth\s*(\d+(?:\.\d+)?)\s*%/);
    if (both) { speed = `${Number(both[1])}%`; fuel = `${Number(both[1])}%`; continue; }
    const labels = [...clause.matchAll(/\b(speed|spd|(?:(?:fuel|bunkers?)\s+)?(?:over[\s-]*)?consumption|bunkers?)\b/g)];
    for (const number of clause.matchAll(/(\d+(?:\.\d+)?)\s*(%|knots?|knts?|kts?)\b|(?:(\d+(?:\.\d+)?)\s*(%))/g)) {
      const value = Number(number[1] ?? number[3]);
      const unit = number[2] ?? number[4];
      const nearest = labels.map((label) => ({ label, distance: Math.min(Math.abs(label.index - (number.index + number[0].length)), Math.abs(number.index - (label.index + label[0].length))) })).sort((a, b) => a.distance - b.distance)[0];
      if (!nearest || nearest.distance > 80) continue;
      if (/speed|spd/.test(nearest.label[0])) speed = `${value}${unit === '%' ? '%' : ' kt'}`;
      else if (unit === '%') fuel = `${value}%`;
    }
  }
  $('aboutSpeed').textContent = speed ?? '0.5 kt';
  $('aboutFuel').textContent = fuel ?? '5%';
  $('aboutStatus').textContent = speed || fuel ? `速度：${speed ? '条款提取' : '默认'} · 油耗：${fuel ? '条款提取' : '默认'}` : '默认容差';
}
function updateWog(rawText) {
  const rules = [
    { pattern: /\bwog\b/i, label: 'WOG' },
    { pattern: /\bwithout\s+guarantee\b/i, label: 'WITHOUT GUARANTEE' },
    { pattern: /\bfor\s+(?:reference|refference)\s+only\b/i, label: 'FOR REFERENCE ONLY' },
    { pattern: /\bgood\s+faith\b/i, label: 'GOOD FAITH' }
  ];
  const matched = rules.filter((rule) => rule.pattern.test(rawText));
  $('wogCard').classList.toggle('active', matched.length > 0);
  $('wogStatus').textContent = matched.length ? '激活' : '正常';
  $('wogReason').textContent = matched.length ? matched.map((rule) => rule.label).join(' · ') : '未检测到相关表述';
}
function updateDashboard() {
}
function parseClause() {
  const rawText = $('clauseText').value;
  const text = normalizeClause(rawText);
  parseAbout(rawText);
  updateWog(rawText);
  const notes = extractPerformanceNotes(rawText);
  $('performanceNotes').value = notes;
  $('performanceNoteStatus').textContent = notes ? 'Relevant clause text copied for manual review' : 'No speed / consumption fields detected';

  const hours = findContinuousHours(text);
  const allTimeGoodWeather = /all\s+time\s+from\s+noon\s+to\s+noon\s+has\s+to\s+be\s+in\s+good\s+weather(?:\s+as\s+defined\s+above)?/.test(text);
  updateTimeWindow(hours ?? 1, hours !== null || allTimeGoodWeather);

  const wind = findNumber([/(?:beaufort|beafort|bf|wind(?:\s*force|\s*scale)?)\s*(?:scale|sc)?\s*(\d)/], text);
  const sea = findNumber([/(?:douglas\s*)?(?:sea\s*state|dss)\s*(\d)/], text);
  const significantHeight = findHeightAround(text, '(?:significant\\s*(?:wave\\s*)?height|sig\\.?\\s*(?:wave\\s*)?height)');
  const swellHeight = findHeightAround(text, 'swell(?:\\s*wave)?\\s*height');
  const windWaveHeight = findHeightAround(text, 'wind[\\s-]*waves?\\s*height');
  const genericHeight = findHeightAround(text, '(?:wave\\s*)?heights?');
  const combinedWaveKeywords = '(?:combined\\s+|(?:the\\s+)?sum\\s+of\\s+)(?:waves?\\s*(?:\\+|and)\\s*swell|swell\\s*(?:\\+|and)\\s*waves?)';
  const combinedWaveSwell = new RegExp(combinedWaveKeywords, 'i').test(text);
  const combinedHeight = combinedWaveSwell ? findHeightAround(text, combinedWaveKeywords) : null;
  if (wind !== null) $('wind').value = wind;
  if (sea !== null) $('sea').value = sea;
  const significant = significantHeight !== null || /(?:significant|sig\.?)\s*(?:wave\s*)?height/.test(text) || combinedWaveSwell;
  const anyHeight = genericHeight !== null || swellHeight !== null || windWaveHeight !== null;
  if (significant) {
    $('wave').value = significantHeight ?? combinedHeight ?? genericHeight ?? 2;
    setWaveMode('significant');
  } else if (anyHeight) {
    if (swellHeight !== null) $('swellHeight').value = swellHeight;
    $('windWaveHeight').value = windWaveHeight ?? genericHeight ?? $('windWaveHeight').value;
    setWaveMode('component');
  } else { $('wave').value = 2; setWaveMode('significant'); }

  $('current').checked = /no\s+adverse\s+current|without\s+adverse\s+current/.test(text);
  $('noCurrentFactor').checked = matchesNoCurrentFactor(text);
  $('extrapolation').checked = matchesNoExtrapolation(text);
  const found = [hours, wind, sea, significantHeight, swellHeight, windWaveHeight].filter((value) => value !== null).length + Number($('noCurrentFactor').checked) + Number($('extrapolation').checked);
  updateDashboard();
  $('parseStatus').textContent = found ? `${found} conditions detected · dashboard updated` : 'No recognised conditions found · dashboard kept at defaults';
}

fields.forEach((id) => $(id).addEventListener('input', () => { if (id === 'hours') $('windowValue').textContent = `${Number($('hours').value) || 1}h`; updateDashboard(); }));
[$('current'), $('extrapolation'), $('noCurrentFactor')].forEach((el) => el.addEventListener('change', updateDashboard));
$('sigWaveSwitch').addEventListener('change', () => updateWaveControls('significant'));
[$('swellSwitch'), $('windWaveSwitch')].forEach((el) => el.addEventListener('change', () => updateWaveControls('component')));
$('clauseText').addEventListener('input', () => { const text = normalizeClause($('clauseText').value); $('noCurrentFactor').checked = matchesNoCurrentFactor(text); $('extrapolation').checked = matchesNoExtrapolation(text); updateDashboard(); });
$('resetBtn').addEventListener('click', () => { document.querySelectorAll('input').forEach((input) => { if (input.type === 'checkbox') input.checked = input.defaultChecked; else input.value = input.defaultValue; }); document.querySelectorAll('select').forEach((select) => select.selectedIndex = [...select.options].findIndex((option) => option.defaultSelected)); $('performanceNotes').value = ''; $('performanceNoteStatus').textContent = 'Awaiting clause analysis'; updateTimeWindow(1, false); updateWaveControls(); updateDashboard(); });
$('parseBtn').addEventListener('click', parseClause);
$('resetBtn').addEventListener('click', () => { parseAbout(''); updateWog(''); });
$('clauseText').addEventListener('input', () => updateWog($('clauseText').value));
updateWaveControls();
updateTimeWindow(1, false);
updateDashboard();
