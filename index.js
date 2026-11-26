(function (exports) {
  const toast = (t) => { try { vendetta.ui.toasts.showToast(String(t)); } catch (e) {} };
  const TAG = " (deleted)";
  const MAX = 500;
  let saved = {};
  let unpatch = null;
  let timer = null;

  const cmp = (a, b) => (a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0);

  const getStorage = () => {
    try { return vendetta.plugin && vendetta.plugin.storage; } catch (e) { return null; }
  };

  const loadSaved = () => {
    try {
      const st = getStorage();
      if (st && st.deleted) saved = JSON.parse(st.deleted) || {};
    } catch (e) { saved = {}; }
  };

  const saveNow = () => {
    try {
      const st = getStorage();
      if (!st) return;
      const keys = Object.keys(saved).sort(cmp);
      if (keys.length > MAX) keys.slice(0, keys.length - MAX).forEach((k) => delete saved[k]);
      st.deleted = JSON.stringify(saved);
    } catch (e) {}
  };

  const saveSoon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(saveNow, 500);
  };

  const toRaw = (m, content) => {
    const a = m.author || {};
    let ts;
    try { ts = m.timestamp && m.timestamp.toISOString ? m.timestamp.toISOString() : String(m.timestamp); }
    catch (e) { ts = new Date().toISOString(); }
    return {
      id: m.id,
      channel_id: m.channel_id,
      content: content,
      author: {
        id: a.id,
        username: a.username,
        global_name: a.globalName || a.global_name || null,
        avatar: a.avatar || null,
        discriminator: a.discriminator || "0",
        bot: !!a.bot,
      },
      timestamp: ts,
      type: 0, flags: 0, pinned: false, tts: false, mention_everyone: false,
      mentions: [], mention_roles: [], attachments: [], embeds: [], components: [],
    };
  };

  const injectSaved = (ev) => {
    if (!ev || !Array.isArray(ev.messages) || !ev.messages.length) return;
    const ids = ev.messages.map((x) => x.id);
    const min = ids.reduce((a, b) => (cmp(a, b) <= 0 ? a : b));
    const max = ids.reduce((a, b) => (cmp(a, b) >= 0 ? a : b));
    const extra = Object.values(saved).filter(
      (r) =>
        r.channel_id === ev.channelId &&
        ids.indexOf(r.id) === -1 &&
        cmp(r.id, min) >= 0 &&
        (ev.hasMoreAfter ? cmp(r.id, max) <= 0 : true)
    );
    if (!extra.length) return;
    return ev.messages.concat(extra).sort((a, b) => cmp(b.id, a.id));
  };

  exports.onLoad = () => {
    try {
      const { findByStoreName } = vendetta.metro;
      const { FluxDispatcher } = vendetta.metro.common;
      const { before } = vendetta.patcher;
      const MessageStore = findByStoreName("MessageStore");
      if (!FluxDispatcher || !MessageStore) return toast("Delete Logger: modules not found");

      loadSaved();

      unpatch = before("dispatch", FluxDispatcher, (args) => {
        try {
          const ev = args[0];
          if (!ev) return;

          if (ev.type === "MESSAGE_DELETE") {
            const msg = MessageStore.getMessage(ev.channelId, ev.id);
            if (!msg || !msg.author || typeof msg.content !== "string") return;
            const content = msg.content.endsWith(TAG) ? msg.content : msg.content + TAG;
            const raw = toRaw(msg, content);
            saved[ev.id] = raw;
            saveSoon();
            args[0] = { type: "MESSAGE_UPDATE", guildId: ev.guildId, message: raw };
            return args;
          }

          if (ev.type === "LOAD_MESSAGES_SUCCESS" || ev.type === "LOAD_MESSAGES_SUCCESS_CACHED") {
            const merged = injectSaved(ev);
            if (merged) {
              args[0] = Object.assign({}, ev, { messages: merged });
              return args;
            }
          }
        } catch (e) {}
      });

      toast(getStorage() ? "Delete Logger ready (saved)" : "Delete Logger ready (no storage)");
    } catch (e) {
      toast("Delete Logger error: " + (e && e.message ? e.message : e));
    }
  };

  exports.onUnload = () => {
    saveNow();
    if (unpatch) { unpatch(); unpatch = null; }
  };
  return exports;
})({});
