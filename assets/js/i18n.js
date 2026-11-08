/* Translates the page automatically from the visitor's location (device time zone).
   Anywhere without a matching language stays in English.
   Nothing is sent to any server. Translations live in translations.json.
   Adding ?lang=es to a link previews a language for that browser tab. */
(function () {
  'use strict';

  var SUPPORTED = ['en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'id', 'ja', 'zh', 'ar'];
  var KEY = 'vm_lang_preview';
  var ZONES = {
    es: /^(America\/(Mexico_City|Cancun|Merida|Monterrey|Matamoros|Mazatlan|Chihuahua|Ojinaga|Ciudad_Juarez|Hermosillo|Tijuana|Bahia_Banderas|Bogota|Lima|Santiago|Punta_Arenas|Argentina\/.+|Buenos_Aires|Cordoba|Caracas|Guayaquil|La_Paz|Montevideo|Asuncion|Panama|Costa_Rica|Guatemala|Tegucigalpa|Managua|El_Salvador|Havana|Santo_Domingo|Puerto_Rico)|Europe\/Madrid|Atlantic\/Canary|Africa\/(Ceuta|Malabo)|Pacific\/Galapagos)$/,
    pt: /^(America\/(Sao_Paulo|Manaus|Fortaleza|Recife|Belem|Bahia|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Araguaina|Maceio|Santarem|Noronha|Eirunepe)|Europe\/Lisbon|Atlantic\/(Azores|Madeira|Cape_Verde)|Africa\/(Luanda|Maputo|Bissau|Sao_Tome))$/,
    fr: /^(Europe\/(Paris|Monaco|Luxembourg|Brussels)|Africa\/(Dakar|Abidjan|Bamako|Algiers|Tunis|Casablanca|Kinshasa|Douala|Libreville|Brazzaville|Conakry|Lome|Niamey|Ouagadougou|Porto-Novo|Bangui|Ndjamena)|Indian\/(Reunion|Mayotte|Antananarivo)|America\/(Port-au-Prince|Martinique|Guadeloupe|Cayenne)|Pacific\/(Tahiti|Noumea))$/,
    de: /^Europe\/(Berlin|Busingen|Vienna|Zurich|Vaduz)$/,
    it: /^Europe\/(Rome|San_Marino|Vatican)$/,
    nl: /^(Europe\/Amsterdam|America\/(Paramaribo|Curacao|Aruba))$/,
    id: /^Asia\/(Jakarta|Pontianak|Makassar|Jayapura)$/,
    ja: /^Asia\/Tokyo$/,
    zh: /^Asia\/(Shanghai|Urumqi)$/,
    ar: /^(Asia\/(Riyadh|Dubai|Kuwait|Qatar|Bahrain|Muscat|Baghdad|Amman|Beirut|Damascus|Aden|Gaza|Hebron)|Africa\/(Cairo|Khartoum|Tripoli))$/
  };

  function preview() {
    var param = new URLSearchParams(window.location.search).get('lang');
    try {
      if (param && SUPPORTED.indexOf(param) !== -1) { window.sessionStorage.setItem(KEY, param); return param; }
      return window.sessionStorage.getItem(KEY);
    } catch (e) {
      return SUPPORTED.indexOf(param) !== -1 ? param : null;
    }
  }
  function byLocation() {
    var zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* older browser */ }
    for (var code in ZONES) if (ZONES[code].test(zone)) return code;
    return 'en';
  }

  var lang = preview() || byLocation();
  var exact = {}, patterns = [];

  function escapeRegex(s) { return s.replace(/[.*+?^$()|[\]\\]/g, '\\$&'); }

  function translate(text) {
    if (lang === 'en' || !text) return text;
    var key = text.replace(/ /g, ' ');
    if (Object.prototype.hasOwnProperty.call(exact, key)) return exact[key];
    for (var i = 0; i < patterns.length; i++) {
      var m = key.match(patterns[i].re);
      if (m) {
        return patterns[i].to.replace(/\{(\d)\}/g, function (_, n) { return m[patterns[i].order.indexOf(n) + 1]; });
      }
    }
    return text;
  }

  function translateNode(node) {
    var raw = node.nodeValue;
    var core = raw.trim();
    if (!core) return;
    var result = translate(core);
    if (result !== core) node.nodeValue = raw.replace(core, function () { return result; });
  }

  var ATTRS = ['placeholder', 'aria-label'];
  function translateAttrs(el) {
    ATTRS.forEach(function (name) {
      if (!el.hasAttribute(name)) return;
      var value = el.getAttribute(name), result = translate(value);
      if (result !== value) el.setAttribute(name, result);
    });
  }
  function skip(el) { return /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.nodeName) || el.getAttribute('translate') === 'no'; }

  function walk(root) {
    if (root.nodeType === 3) { if (root.parentNode && !skip(root.parentNode)) translateNode(root); return; }
    if (root.nodeType !== 1 || skip(root)) return;
    translateAttrs(root);
    for (var c = root.firstChild; c; c = c.nextSibling) walk(c);
  }

  window.VelmioI18n = {
    lang: lang,
    t: translate,
    ready: function (table) {
      Object.keys(table).forEach(function (key) {
        if (key.indexOf('{') === -1) { exact[key] = table[key]; return; }
        var order = [];
        var source = escapeRegex(key).replace(/\{(\d)\}/g, function (_, n) { order.push(n); return '(.+?)'; });
        patterns.push({ re: new RegExp('^' + source + '$'), to: table[key], order: order });
      });
    }
  };

  document.documentElement.lang = lang;
  if (lang === 'ar') document.documentElement.dir = 'rtl';
  if (lang === 'en') return;

  // Parser-blocking on purpose: the words are ready before the page is drawn.
  var base = document.currentScript.src.replace(/js\/i18n\.js.*$/, '');
  document.write('<script src="' + base + 'i18n/' + lang + '.js"><\/script>');

  new MutationObserver(function (records) {
    records.forEach(function (r) {
      if (r.type === 'characterData') walk(r.target);
      else if (r.type === 'attributes') translateAttrs(r.target);
      else Array.prototype.forEach.call(r.addedNodes, walk);
    });
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  document.addEventListener('DOMContentLoaded', function () {
    walk(document.documentElement);
    document.title = translate(document.title);
  });
})();
