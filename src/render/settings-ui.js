// The settings overlay: rebind every action on keyboard and gamepad, and tune the virtual
// stick. Owns no game state - it edits a settings object, persists it, and calls back so the
// input layer and the touch layer can pick the change up live.
import {
  ACTIONS, GROUPS, SLOTS, bind, unbind, defaultSettings, saveSettings, clearSettings,
  keyLabel, padLabel, unbound,
} from '../settings.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function createSettingsUI({ input, touch, settings, onChange }) {
  const root = $('settings');
  const body = $('settings-body');
  const note = $('settings-note');
  const tabs = [...document.querySelectorAll('#settings-tabs .tab')];
  let tab = 'controls';
  let cancelCapture = null;
  let padLoop = 0;

  const commit = () => {
    saveSettings(settings);
    input.setBindings(settings);
    touch?.refresh(settings);
    onChange?.(settings);
  };

  function setNote(text, warn = false) {
    note.textContent = text;
    note.classList.toggle('warn', warn);
  }

  function defaultNote() {
    const missing = unbound(settings);
    if (missing.length) {
      const names = missing.map((id) => ACTIONS.find((a) => a.id === id)?.label || id);
      setNote(`Unbound: ${names.join(', ')}. Those actions cannot be used until you bind them.`, true);
    } else {
      setNote('Click a slot, then press the key or gamepad button you want. Esc cancels, Del clears.');
    }
  }

  // ---------------------------------------------------------------- rebinding
  function stopCapture() {
    if (cancelCapture) { cancelCapture(); cancelCapture = null; }
    if (padLoop) { cancelAnimationFrame(padLoop); padLoop = 0; }
    document.removeEventListener('keydown', onCaptureKey, true);
    body.querySelectorAll('.slot.listening').forEach((s) => s.classList.remove('listening'));
  }

  let capturing = null;              // { action, slot, device }
  function onCaptureKey(e) {
    if (!capturing) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopCapture(); capturing = null; render(); defaultNote(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); e.stopPropagation();
      const { action, slot, device } = capturing;
      unbind(device === 'pad' ? settings.pad : settings.keys, action, slot);
      stopCapture(); capturing = null; commit(); render(); defaultNote();
    }
  }

  function beginCapture(action, slot, device, slotEl) {
    stopCapture();
    capturing = { action, slot, device };
    slotEl.classList.add('listening');
    slotEl.textContent = 'Press…';
    setNote(device === 'pad' ? 'Press a gamepad button. Esc cancels, Del clears.' : 'Press a key. Esc cancels, Del clears.');
    document.addEventListener('keydown', onCaptureKey, true);
    cancelCapture = input.captureNext((ev) => {
      cancelCapture = null;
      capturing = null;
      if (device === 'pad' && ev.type === 'pad') bind(settings.pad, action, slot, ev.index);
      else if (device === 'key' && ev.type === 'key') bind(settings.keys, action, slot, ev.code);
      stopCapture();
      commit();
      render();
      defaultNote();
    });
    // The sim loop is not stepping while this overlay is up, so drive the pad poll here.
    const tick = () => { input.pollCapture(); padLoop = requestAnimationFrame(tick); };
    padLoop = requestAnimationFrame(tick);
  }

  function slotButton(action, slot, device) {
    const list = (device === 'pad' ? settings.pad : settings.keys)[action] || [];
    const value = list[slot];
    const has = value !== undefined && value !== null;
    const b = el('button', `slot${has ? '' : ' empty'}`, has ? (device === 'pad' ? padLabel(value) : keyLabel(value)) : '—');
    b.type = 'button';
    b.dataset.action = action; b.dataset.slot = String(slot); b.dataset.device = device;
    b.title = has ? 'Click to rebind, Del to clear' : 'Click to bind';
    b.addEventListener('click', () => beginCapture(action, slot, device, b));
    return b;
  }

  // ---------------------------------------------------------------- tabs
  function renderControls() {
    const wrap = el('div', 'bindings');
    const head = el('div', 'brow head');
    head.append(el('span', 'baction', 'Action'));
    for (let i = 0; i < SLOTS; i++) head.append(el('span', 'bslot', i === 0 ? 'Key' : `Alt ${i}`));
    head.append(el('span', 'bslot', 'Gamepad'));
    wrap.append(head);
    let group = null;
    for (const a of ACTIONS) {
      if (a.group !== group) { group = a.group; wrap.append(el('div', 'bgroup', GROUPS[group])); }
      const row = el('div', 'brow');
      row.dataset.action = a.id;
      row.append(el('span', 'baction', a.label));
      for (let i = 0; i < SLOTS; i++) row.append(slotButton(a.id, i, 'key'));
      const moves = ['left', 'right', 'up', 'down'].includes(a.id);
      if (moves) {
        const s = el('span', 'slot fixed', 'Stick / D-pad');
        s.title = 'Gamepad movement is the left stick and d-pad, and is not rebindable';
        row.append(s);
      } else row.append(slotButton(a.id, 0, 'pad'));
      wrap.append(row);
    }
    return wrap;
  }

  function control(label, node, hint) {
    const row = el('div', 'srow');
    row.append(el('span', 'slabel', label));
    row.append(node);
    if (hint) row.append(el('span', 'shint', hint));
    return row;
  }

  function segmented(value, options, onPick) {
    const g = el('div', 'seg');
    for (const [val, text] of options) {
      const b = el('button', `segb${val === value ? ' on' : ''}`, text);
      b.type = 'button';
      b.addEventListener('click', () => { onPick(val); commit(); render(); });
      g.append(b);
    }
    return g;
  }

  function slider(value, min, max, step, format, onSet) {
    const wrap = el('div', 'slider');
    const i = document.createElement('input');
    i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
    const out = el('span', 'sval', format(value));
    i.addEventListener('input', () => { out.textContent = format(+i.value); onSet(+i.value); commit(); });
    wrap.append(i, out);
    return wrap;
  }

  function toggle(value, onSet) {
    const b = el('button', `toggle${value ? ' on' : ''}`, value ? 'On' : 'Off');
    b.type = 'button';
    b.addEventListener('click', () => { onSet(!value); commit(); render(); });
    return b;
  }

  function renderTouch() {
    const t = settings.touch;
    const wrap = el('div', 'touchset');
    wrap.append(control('On-screen controls',
      segmented(t.mode, [['auto', 'Auto'], ['on', 'Always'], ['off', 'Off']], (v) => { t.mode = v; }),
      'Auto shows them on touchscreens only'));
    wrap.append(control('Stick side',
      segmented(t.side, [['left', 'Left'], ['right', 'Right']], (v) => { t.side = v; })));
    wrap.append(control('Floating stick', toggle(t.floating, (v) => { t.floating = v; }),
      'The ring springs to wherever your thumb lands'));
    wrap.append(control('Stick size',
      slider(t.size, 110, 220, 2, (v) => `${v}px`, (v) => { t.size = v; })));
    wrap.append(control('Dead zone',
      slider(Math.round(t.deadzone * 100), 5, 50, 1, (v) => `${v}%`, (v) => { t.deadzone = v / 100; })));
    wrap.append(control('Opacity',
      slider(Math.round(t.opacity * 100), 25, 100, 5, (v) => `${v}%`, (v) => { t.opacity = v / 100; })));
    wrap.append(control('Vibrate on tap', toggle(t.haptics, (v) => { t.haptics = v; })));
    const tip = el('p', 'tip', t.mode === 'off'
      ? 'On-screen controls are off, so this tab only affects them once you turn them back on.'
      : 'Changes apply straight away. Close this menu to try them.');
    wrap.append(tip);
    return wrap;
  }

  function render() {
    body.innerHTML = '';
    body.append(tab === 'controls' ? renderControls() : renderTouch());
    for (const b of tabs) b.classList.toggle('selected', b.dataset.tab === tab);
  }

  for (const b of tabs) b.addEventListener('click', () => { tab = b.dataset.tab; stopCapture(); capturing = null; render(); defaultNote(); });

  $('settings-reset').addEventListener('click', () => {
    stopCapture(); capturing = null;
    const fresh = tab === 'touch' ? { ...settings, touch: defaultSettings().touch } : { ...defaultSettings(), touch: settings.touch };
    settings.keys = fresh.keys; settings.pad = fresh.pad; settings.touch = fresh.touch;
    commit();
    render();
    setNote(tab === 'touch' ? 'Touch layout reset.' : 'Bindings reset to defaults.');
  });
  $('settings-close').addEventListener('click', () => close());

  function open() {
    stopCapture(); capturing = null;
    render();
    defaultNote();
    root.hidden = false;
    input.setEnabled(false);          // menu owns the keyboard while it is up
  }
  function close() {
    stopCapture(); capturing = null;
    root.hidden = true;
    input.setEnabled(true);
    onChange?.(settings);
  }

  // Esc closes, unless a capture is swallowing it.
  document.addEventListener('keydown', (e) => {
    if (root.hidden || e.key !== 'Escape' || capturing) return;
    e.preventDefault();
    close();
  });

  return { open, close, toggle: () => (root.hidden ? open() : close()), get isOpen() { return !root.hidden; } };
}
