const $ = (id) => document.getElementById(id);
const fields = ['hours', 'wind', 'sea', 'wave', 'swellHeight', 'windWaveHeight'];

function normalizeClause(text) {
  const numberWords = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12' };
  return text.replace(/[\u2018\u2019\u201c\u201d]/g, '"').replace(/[\u00a0\u200b]/g, ' ').replace(/(\d),(\d)/g, '$1.$2').replace(/,/g, ' ').toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, (word) => numberWords[word]);
}
function findNumber(patterns, text) {
  for (const pattern of patterns) { const match = text.match(pattern); if (match) return Number(match[1]); }
  return null;
}
function findContinuousHours(text) {
  // Handle spelled-out numbers (including words already normalized to digits)
  // and parenthetical numerals such as "twenty four (24) consecutive hours".
  const tens = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const units = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  const timeText = text.toLowerCase()
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine|[1-9])\b)?/g,
      (_, ten, unit) => String(tens[ten] + (units[unit] ?? Number(unit ?? 0))))
    .replace(/(?:\b\d+\s*)?[(（]\s*(\d+(?:\.\d+)?)\s*[)）]/g, '$1');
  // Keep the number tied to an hours unit; accept the continuity keyword on either side.
  return findNumber([
    /(\d+(?:\.\d+)?)\s*(?:consecutive|continuous)\s*(?:hours?|hrs?)\b/,
    /(?:consecutive|continuous)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/,
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b\s*(?:of\s+)?(?:consecutive|continuous)\b/,
    /(?:consecutive|continuous)\b[^.;!?]{0,40}?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/,
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b[^.;!?]{0,40}?\b(?:consecutive|continuous)\b/,
    /prevail[\s\S]{0,160}?(?:over\s+)?(?:a\s+)?period\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/,
    /prevail[\s\S]{0,160}?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/
  ], timeText);
}
function findHeightAround(text, keywordSource) {
  const unitNumber = '(?:max(?:imum)?\\s*)?(\\d+(?:\\.\\d+)?)\\s*(?:m|mtrs?|met(?:er|re)s?)\\b';
  const afterKeyword = new RegExp(`${keywordSource}[\\s\\S]{0,60}?${unitNumber}`, 'i');
  const beforeKeyword = new RegExp(`${unitNumber}[\\s\\S]{0,60}?${keywordSource}`, 'i');
  const match = text.match(afterKeyword) ?? text.match(beforeKeyword);
  return match ? Number(match[1]) : null;
}
function matchesNoAdverseCurrent(text) {
  return /\b(?:no|without)\s+adverse\s+currents?\b/.test(text) ||
    /\bno\s+negative\s+influence\s+(?:by|of|from)\s+(?:swell\s*(?:\/|and|&)\s*)?adverse\s+currents?\b/.test(text);
}
function matchesNoCurrentFactor(text) {
  if (/\bno\s+average\s+current\s+factor\b/i.test(text)) return true;
  const explicit = [/no\s+current\s+factor/, /net\s+current\s+factor\s+(?:is\s+)?not\s+to\s+apply/, /no\s+averaging\s+currents?\s+to\s+calculate\s+daily\s+cf/, /steaming\s+days?[\s\S]{0,180}adverse\s+currents?[\s\S]{0,180}not\s+to\s+be\s+included/].some((pattern) => pattern.test(text));
  const noonToNoonDay = /good\s+weather\s+days?/.test(text) && /noon\s+to\s+noon/.test(text) && /(?:all\s+parts?|all\s+(?:6\s*[- ]?hourly\s+)?periods?|6\s*[- ]?hourly\s+periods?)[\s\S]{0,100}(?:comply|compliance|criteria)/.test(text);
  const continuousPeriod = /good\s+weather\s+period[\s\S]{0,180}\d+\s*hours?[\s\S]{0,100}noon\s+to\s+noon[\s\S]{0,180}(?:continuously|entire\s+period)[\s\S]{0,100}(?:criteria|comply)/.test(text);
  return explicit || noonToNoonDay || continuousPeriod;
}
function matchesInvalidExtrapolation(text) {
  // Line wrapping does not end a clause; sentence/semicolon boundaries do.
  const segments = text.split(/[;.!?]+/);
  return segments.some((segment) =>
    /\bextrapolations?\b/i.test(segment) &&
    /\bweather[\s-]+conditions?\b/i.test(segment) &&
    /\b(?:described|defined|specified|stated|set\s+out)\s+above\b/i.test(segment)
  );
}
function matchesNoExtrapolation(text) {
  const segments = text.split(/[;.!?]+/);
  if (matchesInvalidExtrapolation(text)) return false;
  // Explicit claim restrictions are distinct from merely defining good weather.
  const restrictedClaims = segments.some((segment) => [
    /\bclaims?\s+(?:(?:can|may|shall)\s+)?only\s+be\s+(?:submitted|brought|made)\s+(?:in\s+respect\s+of|for)\s+(?:(?:the|those)\s+)?periods?\s+(?:during|in)\s+which\s+the\s+vessel\s+encounters?\s+good\s+weather\b/i,
    /\bclaims?(?:\s+arising\s+therefrom)?\s+(?:(?:shall|will|must)\s+be|are)\s+(?:restricted|limited)\s+to\s+(?:only\s+)?(?:that\s+|the\s+|qualifying\s+)?good\s+weather\s+periods?\b/i,
    /\bclaims?\s+(?:(?:can|may|shall)\s+)?only\s+be\s+(?:submitted|brought|made)\s+(?:in\s+respect\s+of|for)\s+(?:(?:the|qualifying)\s+)?good\s+weather\s+periods?\b/i,
    /\bno\s+claims?(?:\s+whatsoever)?\s+(?:may|can|shall)\s+be\s+(?:brought|made|submitted)\s+for\s+[^;.!?]{0,150}?\bduring\s+(?:periods?\s+of\s+time\s+that\s+are\s+not\s+good\s+weather\s+periods?|bad\s+weather\s+periods?|non[\s-]+good[\s-]+weather\s+periods?)\b/i
  ].some((pattern) => pattern.test(segment)));
  return restrictedClaims || /\bextrapolations?\b|\b(?:didymi|didimy)\s+(?:principle|case(?:\s+calculations?)?)\s+(?:(?:is|are|shall|will)\s+)?not\s+(?:to\s+apply|(?:to\s+be\s+|be\s+)?applied)\b/i.test(text);
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
function readAbout(rawText) {
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
  return { speed, fuel };
}
function parseAbout(rawText) {
  const { speed, fuel } = readAbout(rawText);
  $('aboutSpeed').textContent = speed ?? '0.5 kt';
  $('aboutFuel').textContent = fuel ?? '5%';
  $('aboutStatus').textContent = speed || fuel ? `速度：${speed ? '条款提取' : '默认'} · 油耗：${fuel ? '条款提取' : '默认'}` : '默认容差';
}
function matchesWog(rawText) {
  const rules = [
    { pattern: /\bwog\b/i, label: 'WOG' },
    { pattern: /\bwithout\s+guarantee\b/i, label: 'WITHOUT GUARANTEE' },
    { pattern: /\bfor\s+(?:reference|refference)\s+only\b/i, label: 'FOR REFERENCE ONLY' },
    { pattern: /\bgood\s+faith\b/i, label: 'GOOD FAITH' }
  ];
  return rules.some((rule) => rule.pattern.test(rawText));
}
function updateWog(rawText) {
  $('wogCard').classList.toggle('active', matchesWog(rawText));
}
function updateDashboard() {
}
function parseClause() {
  const rawText = $('clauseText').value;
  const text = normalizeClause(rawText);
  parseAbout(rawText);
  updateWog(rawText);
  updateClauseEvidence(rawText);

  const hours = findContinuousHours(text);
  const allTimeGoodWeather = matchesAllTimeGoodWeather(text);
  updateTimeWindow(hours ?? 1, hours !== null || allTimeGoodWeather);

  const { wind, sea, significantHeight, swellHeight, windWaveHeight, genericHeight, combinedHeight, significant, anyHeight } = readWeatherConditions(text);
  if (wind !== null) $('wind').value = wind;
  if (sea !== null) $('sea').value = sea;
  if (significant) {
    $('wave').value = significantHeight ?? combinedHeight ?? genericHeight ?? 2;
    setWaveMode('significant');
  } else if (anyHeight) {
    $('swellHeight').value = swellHeight ?? 2;
    $('windWaveHeight').value = windWaveHeight ?? genericHeight ?? $('windWaveHeight').value;
    setWaveMode('component');
  } else { $('wave').value = 2; setWaveMode('significant'); }

  $('current').checked = matchesNoAdverseCurrent(text);
  $('noCurrentFactor').checked = matchesNoCurrentFactor(text);
  $('extrapolation').checked = matchesNoExtrapolation(text);
  const found = [hours, wind, sea, significantHeight, swellHeight, windWaveHeight].filter((value) => value !== null).length + Number($('noCurrentFactor').checked) + Number($('extrapolation').checked);
  updateDashboard();
  $('parseStatus').textContent = found ? `${found} conditions detected · dashboard updated` : 'No recognised conditions found · dashboard kept at defaults';
}

function matchesAllTimeGoodWeather(text) {
  return /all\s+time\s+from\s+noon\s+to\s+noon\s+has\s+to\s+be\s+in\s+good\s+weather(?:\s+as\s+defined\s+above)?/.test(text);
}
function readWeatherConditions(text) {
  const wind = findNumber([/\b(?:beaufort|beafort|bf|wind)\s*(?:force|scale|sc)?\s*(\d+)\b/], text);
  const sea = findNumber([/(?:douglas\s*)?(?:sea\s*state|dss)\s*(\d)/], text);
  const significantKeywords = '\\b(?:significant|sig\\.?)\\s*(?:waves?(?:\\s*heights?)?|heights?)\\b';
  const significantHeight = findHeightAround(text, significantKeywords);
  const swellHeight = findHeightAround(text, 'swell(?:\\s*wave)?\\s*height');
  const windWaveHeight = findHeightAround(text, 'wind[\\s-]*waves?\\s*height');
  // An explicit metre value in parentheses after DSS is a height, not a scale conversion.
  const seaStateHeight = findNumber([/\b(?:douglas\s+sea\s+state|sea\s+state|dss)\s*\d+\s*\(\s*(?:max(?:imum)?\s*)?(\d+(?:\.\d+)?)\s*(?:metres?|meters?|m)\b\s*\)/], text);
  const genericHeight = findHeightAround(text, '(?:wave\\s*)?heights?') ?? seaStateHeight;
  const combinedWaveKeywords = '(?:combined\\s+|(?:the\\s+)?(?:sum|combination)\\s+of\\s+)(?:(?:waves?|sea)(?:\\s+heights?)?\\s*(?:\\+|and)\\s*swell(?:\\s+heights?)?|swell(?:\\s+heights?)?\\s*(?:\\+|and)\\s*(?:waves?|sea)(?:\\s+heights?)?)';
  const combinedWaveSwell = new RegExp(combinedWaveKeywords, 'i').test(text);
  const combinedHeight = combinedWaveSwell ? findHeightAround(text, combinedWaveKeywords) : null;
  const significant = significantHeight !== null || new RegExp(significantKeywords, 'i').test(text) || combinedWaveSwell;
  const anyHeight = genericHeight !== null || swellHeight !== null || windWaveHeight !== null;
  return { wind, sea, significantHeight, swellHeight, windWaveHeight, genericHeight, combinedHeight, significant, anyHeight };
}

function splitSourceClauses(rawText) {
  // Keep original spelling, punctuation and soft line wraps; decimals and common
  // clause abbreviations are not sentence endings.
  const pieces = [];
  let start = 0;
  for (const boundary of rawText.matchAll(/[.!?;]|\r?\n/g)) {
    const index = boundary.index;
    if (boundary[0] === '.' && (
      /\d/.test(rawText[index - 1] ?? '') && /\d/.test(rawText[index + 1] ?? '') ||
      /\b(?:abt|sig|i|e)\.$/i.test(rawText.slice(0, index + 1))
    )) continue;
    let end = index + boundary[0].length;
    while (/[)\]"\u201d\u2019]/.test(rawText[end] ?? '') && end < rawText.length) end++;
    const source = rawText.slice(start, end).trim();
    if (source) pieces.push({ source, start, end });
    start = end;
  }
  const tail = rawText.slice(start).trim();
  if (tail) pieces.push({ source: tail, start, end: rawText.length });
  return pieces;
}
function extractRecognizedSource(rawText) {
  const pieces = splitSourceClauses(rawText);
  const normalized = pieces.map(piece => normalizeClause(piece.source));
  const selected = new Set();
  // Use the same readers as the controls, including the OFF exception for
  // extrapolation. Do not infer evidence from defaults or fuel keywords alone.
  const detectors = [
    text => readAbout(text).speed !== null,
    text => readAbout(text).fuel !== null,
    matchesWog,
    ...['wind', 'sea', 'significantHeight', 'swellHeight', 'windWaveHeight', 'genericHeight', 'combinedHeight']
      .map(key => text => readWeatherConditions(text)[key] !== null),
    text => readWeatherConditions(text).significant,
    text => findContinuousHours(text) !== null,
    matchesAllTimeGoodWeather,
    matchesNoAdverseCurrent,
    matchesNoCurrentFactor,
    matchesNoExtrapolation,
    matchesInvalidExtrapolation
  ];
  for (const detect of detectors) {
    normalized.forEach((text, index) => { if (detect(text)) selected.add(index); });
    // Some existing rules deliberately combine criteria across sentences.
    // Include the shortest contiguous supporting passages for those matches.
    if (!detect(normalizeClause(rawText))) continue;
    let start = 0;
    for (let end = 0; end < pieces.length; end++) {
      if (!detect(normalized.slice(start, end + 1).join('\n'))) continue;
      while (start < end && detect(normalized.slice(start + 1, end + 1).join('\n'))) start++;
      for (let index = start; index <= end; index++) selected.add(index);
      start = end + 1;
    }
  }
  // Merge adjacent selected pieces by slicing the original input, preserving
  // its actual whitespace and wrapped lines rather than reconstructing text.
  const excerpts = [];
  for (let index = 0; index < pieces.length; index++) {
    if (!selected.has(index)) continue;
    const start = pieces[index].start;
    while (selected.has(index + 1)) index++;
    excerpts.push(rawText.slice(start, pieces[index].end).trim());
  }
  return excerpts.join('\n\n');
}
function updateClauseEvidence(rawText) {
  const source = extractRecognizedSource(rawText);
  $('performanceNotes').value = source;
  $('performanceNoteStatus').textContent = source ? '已摘录识别到的合同原文' : '未识别到影响下方选项的合同原文';
}

fields.forEach((id) => $(id).addEventListener('input', () => { if (id === 'hours') $('windowValue').textContent = `${Number($('hours').value) || 1}h`; updateDashboard(); }));
[$('current'), $('extrapolation'), $('noCurrentFactor')].forEach((el) => el.addEventListener('change', updateDashboard));
$('sigWaveSwitch').addEventListener('change', () => updateWaveControls('significant'));
[$('swellSwitch'), $('windWaveSwitch')].forEach((el) => el.addEventListener('change', () => updateWaveControls('component')));
$('clauseText').addEventListener('input', () => { const text = normalizeClause($('clauseText').value); $('noCurrentFactor').checked = matchesNoCurrentFactor(text); $('extrapolation').checked = matchesNoExtrapolation(text); updateDashboard(); });
$('resetBtn').addEventListener('click', () => { document.querySelectorAll('input').forEach((input) => { if (input.type === 'checkbox') input.checked = input.defaultChecked; else input.value = input.defaultValue; }); document.querySelectorAll('select').forEach((select) => select.selectedIndex = [...select.options].findIndex((option) => option.defaultSelected)); $('performanceNotes').value = ''; $('performanceNoteStatus').textContent = '等待条款解析'; updateTimeWindow(1, false); updateWaveControls(); updateDashboard(); });
$('parseBtn').addEventListener('click', parseClause);
$('resetBtn').addEventListener('click', () => { parseAbout(''); updateWog(''); });
$('clauseText').addEventListener('input', () => updateWog($('clauseText').value));
$('clauseText').addEventListener('input', () => {
  $('performanceNotes').value = '';
  $('performanceNoteStatus').textContent = '条款已更改，请点击 Parse clause 更新原文摘录';
});
updateWaveControls();
updateTimeWindow(1, false);
updateDashboard();
