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
function matchesNoCurrentFactor(text) {
  const explicit = [/no\s+current\s+factor/, /net\s+current\s+factor\s+(?:is\s+)?not\s+to\s+apply/, /no\s+averaging\s+currents?\s+to\s+calculate\s+daily\s+cf/, /steaming\s+days?[\s\S]{0,180}adverse\s+currents?[\s\S]{0,180}not\s+to\s+be\s+included/].some((pattern) => pattern.test(text));
  const noonToNoonDay = /good\s+weather\s+days?/.test(text) && /noon\s+to\s+noon/.test(text) && /(?:all\s+parts?|all\s+(?:6\s*[- ]?hourly\s+)?periods?|6\s*[- ]?hourly\s+periods?)[\s\S]{0,100}(?:comply|compliance|criteria)/.test(text);
  const continuousPeriod = /good\s+weather\s+period[\s\S]{0,180}\d+\s*hours?[\s\S]{0,100}noon\s+to\s+noon[\s\S]{0,180}(?:continuously|entire\s+period)[\s\S]{0,100}(?:criteria|comply)/.test(text);
  return explicit || noonToNoonDay || continuousPeriod;
}
function matchesNoExtrapolation(text) {
  return /no\s+extrapolation(?:s)?|extrapolation(?:s)?\s+(?:is\s+)?not\s+(?:to\s+be\s+)?allowed|extrapolation(?:s)?\s+(?:are\s+)?prohibited|didymi\s+principle\s+(?:is\s+)?not\s+to\s+apply/.test(text);
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
  $('swellHeight').disabled = significant;
  $('windWaveHeight').disabled = significant;
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
function updateDashboard() {
  $('findingHours').textContent = `${Number($('hours').value) || 1}-hour`;
  $('findingWind').textContent = $('wind').value;
  $('findingSea').textContent = $('sea').value;
  const detected = 4 + Number($('current').checked) + Number($('extrapolation').checked) + Number($('noCurrentFactor').checked);
  $('conditionCount').textContent = `${detected} conditions detected`;
}
function parseClause() {
  const rawText = $('clauseText').value;
  const text = normalizeClause(rawText);
  const notes = extractPerformanceNotes(rawText);
  $('performanceNotes').value = notes;
  $('performanceNoteStatus').textContent = notes ? 'Relevant clause text copied for manual review' : 'No speed / consumption fields detected';

  const hours = findNumber([/(\d+(?:\.\d+)?)\s*(?:consecutive|continuous)\s*hours?/, /(?:consecutive|continuous)\s*(\d+(?:\.\d+)?)\s*hours?/, /prevail[\s\S]{0,160}?(?:over\s+)?(?:a\s+)?period\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*hours?/, /prevail[\s\S]{0,160}?(\d+(?:\.\d+)?)\s*hours?/], text);
  const allTimeGoodWeather = /all\s+time\s+from\s+noon\s+to\s+noon\s+has\s+to\s+be\s+in\s+good\s+weather(?:\s+as\s+defined\s+above)?/.test(text);
  updateTimeWindow(hours ?? 1, hours !== null || allTimeGoodWeather);

  const wind = findNumber([/(?:beaufort|beafort|bf|wind(?:\s*force|\s*scale)?)\s*(?:scale)?\s*(\d)/], text);
  const sea = findNumber([/(?:douglas\s*)?(?:sea\s*state|dss)\s*(\d)/], text);
  const significantHeight = findNumber([/(?:significant\s*(?:wave\s*)?height|sig\.?\s*(?:wave\s*)?height)\s*(?:not\s*(?:exceeding|over)|<=?|of|max(?:imum)?\s*)?\s*(\d+(?:\.\d+)?)/], text);
  const swellHeight = findNumber([/swell(?:\s*wave)?\s*height\s*(?:not\s*(?:exceeding|over)|<=?|of|max(?:imum)?\s*)?\s*(\d+(?:\.\d+)?)/, /swell\s*(?:not\s*(?:exceeding|over)|<=?)\s*(\d+(?:\.\d+)?)/], text);
  const windWaveHeight = findNumber([/wind[\s-]*waves?\s*height\s*(?:not\s*(?:exceeding|over)|<=?|of|max(?:imum)?\s*)?\s*(\d+(?:\.\d+)?)/, /wind[\s-]*waves?\s*(?:not\s*(?:exceeding|over)|<=?)\s*(\d+(?:\.\d+)?)/], text);
  const genericHeight = findNumber([/(?:wave\s*)?heights?\s*(?:not\s*(?:exceeding|over)|<=?|of|max(?:imum)?\s*)?\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:er|re)s?)/], text);
  const combinedWaveSwell = /combined\s+(?:waves?\s*(?:\+|and)\s*swell|swell\s*(?:\+|and)\s*waves?)/.test(text);
  const combinedHeight = combinedWaveSwell ? findNumber([/(?:max(?:imum)?|under|not\s*(?:exceeding|over))\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:er|re)s?)[\s\S]{0,100}combined\s+(?:waves?\s*(?:\+|and)\s*swell|swell\s*(?:\+|and)\s*waves?)/, /combined\s+(?:waves?\s*(?:\+|and)\s*swell|swell\s*(?:\+|and)\s*waves?)[\s\S]{0,100}(?:max(?:imum)?|under|not\s*(?:exceeding|over))\s*(\d+(?:\.\d+)?)\s*(?:m|met(?:er|re)s?)/], text) : null;
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
$('reportBtn').addEventListener('click', () => document.getElementById('report').scrollIntoView({ behavior: 'smooth' }));
$('parseBtn').addEventListener('click', parseClause);
$('copyBtn').addEventListener('click', async () => { const text = [...document.querySelectorAll('.finding p')].map((item) => item.innerText).join('\n\n'); try { await navigator.clipboard.writeText(text); $('toast').classList.add('show'); setTimeout(() => $('toast').classList.remove('show'), 2200); } catch { } });
updateWaveControls();
updateTimeWindow(1, false);
updateDashboard();
