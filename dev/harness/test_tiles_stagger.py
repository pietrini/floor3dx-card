"""The room panel's device tiles as a staggered (masonry) grid: on a narrow card wide enough for two
columns, tiles of different heights pack up under each other with the usual 8 px gap instead of
lining up in rows of equal height. One column - a phone, the side panel of a wide card - keeps the
plain list. Demo house, fake connection."""
import json, sys
from run import run

JS = r"""async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const base = window.card;
  const card = Object.assign({}, base._config, {entities: [], object_groups: []}); delete card.style; delete card.type; delete card.look; delete card.daylight;
  const connection = { subscribeMessage() { return Promise.resolve(() => {}); } };
  const dim = (n) => ({state: 'on', attributes: {friendly_name: n, brightness: 128, supported_color_modes: ['color_temp', 'hs'], color_mode: 'hs', hs_color: [30, 80], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500, color_temp_kelvin: 3000}});
  const sw = (n) => ({state: 'off', attributes: {friendly_name: n}});
  const states = {'light.a': dim('Ceiling'), 'switch.b': sw('Kettle'), 'switch.c': sw('Fan'), 'switch.d': sw('Radio'), 'light.e': dim('Desk'), 'switch.f': sw('Heater'), 'switch.g': sw('Plug')};
  const hass = {states, connection, language: 'en', themes: {}, config: {}, user: {}, callService() { return Promise.resolve(); }};
  const rooms = [{id: 'r', name: 'Hall', floors: ['room_0_1'], entities: Object.keys(states).map(entity => ({entity}))}];
  const el = document.createElement('floor3dx-rooms-card'); el.setConfig({card, rooms, title: 'T', height: '900px'}); el.hass = hass;
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:900px;z-index:99'; document.body.appendChild(d); d.appendChild(el);
  const t = performance.now(); while (!(el._slots.length && el._slots.every(s => s.el && s.el._modelready)) && performance.now() - t < 240000) await sleep(200);
  await sleep(300); el._select('r'); await sleep(300); el._render(); await sleep(300);
  const snap = () => {
    const g = el._ui.querySelector('.tiles');
    const items = [...g.children].map(x => { const r = x.getBoundingClientRect(); return {name: x.querySelector('.tname')?.textContent.trim(), x: Math.round(r.left), top: r.top, bottom: r.bottom, h: r.height}; });
    return {stagger: g.classList.contains('stagger'), cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, items};
  };
  const at = async (w) => { d.style.width = w + 'px'; el._layout(); await sleep(400); el._render(); await sleep(300); return snap(); };
  const out = {};
  out.wide = snap();
  out.phone = await at(390);
  out.tablet = await at(640);
  // a tile that grows (here: made taller by hand, as an opened control would) moves the ones under it
  const g = el._ui.querySelector('.tiles'), first = g.children[0];
  const under = () => { const s = snap(); const col = s.items.filter(i => i.x === s.items[0].x); return col[1] ? col[1].top - s.items[0].bottom : null; };
  out.gapBefore = under();
  first.style.paddingBottom = '60px'; await sleep(300);
  out.gapAfter = under(); out.grown = snap();
  first.style.paddingBottom = '';
  out.back = await at(390);
  d.remove();
  return out;
}"""


def column_gaps(s):
    gaps, overlap = [], False
    for x in sorted({i['x'] for i in s['items']}):
        col = sorted((i for i in s['items'] if i['x'] == x), key=lambda i: i['top'])
        for a, b in zip(col, col[1:]):
            gaps.append(round(b['top'] - a['bottom'], 1))
            if b['top'] < a['bottom'] - 0.5: overlap = True
    return gaps, overlap


if __name__ == '__main__':
    r, errors = run(after=lambda page: page.evaluate(JS), timeout_ms=600000)
    print(json.dumps(r))
    fails = 0
    def check(name, ok):
        global fails
        print(('PASS ' if ok else 'FAIL ') + name)
        if not ok: fails += 1
    W, P, T, G, B = (r.get(k) or {} for k in ('wide', 'phone', 'tablet', 'grown', 'back'))
    check('wide card: the side panel keeps one column, not staggered', W.get('cols') == 1 and W.get('stagger') is False)
    check('phone width: one column, not staggered', P.get('cols') == 1 and P.get('stagger') is False and len(P.get('items') or []) == 7)
    hs = [i['h'] for i in (T.get('items') or [])]
    check('the tiles differ in height (a light with controls, a plain switch)', hs and max(hs) > min(hs) + 40)
    check('narrow tablet width: two or more columns, staggered', (T.get('cols') or 0) >= 2 and T.get('stagger') is True)
    gaps, overlap = column_gaps(T)
    check('staggered: no tile overlaps another; each tile sits 8 px under the one above it', gaps and not overlap and all(7 <= g <= 9 for g in gaps))
    tops = sorted(i['top'] for i in T.get('items') or [])
    check('staggered: every column starts at the top of the grid', len(tops) > 1 and tops[(T.get('cols') or 1) - 1] - tops[0] < 1)
    check('a tile that grows pushes the one under it down, keeping the gap', r.get('gapBefore') is not None and 7 <= r.get('gapBefore') <= 9 and r.get('gapAfter') is not None and 7 <= r.get('gapAfter') <= 9 and not column_gaps(G)[1])
    check('back to phone width: the plain list again, no row spans left', B.get('stagger') is False and B.get('cols') == 1 and not column_gaps(B)[1])
    check('no page errors', not errors)
    for e in errors[:5]: print('  error:', e[:300])
    sys.exit(1 if fails else 0)
