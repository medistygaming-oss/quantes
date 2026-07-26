// ===================== TEAMCRUZ • BOT V2 (SLASH FULL) =====================
// discord.js v14 | Slash Komutlar (Prefix Yok)
// Ticket • Guard • OT • Aktiflik • BanAffı • FiveM • Ses • Mod
// + Web Panel (Express API + Static Serve)
// =========================================================================
process.on("unhandledRejection", (r) => console.error("UNHANDLED_REJECTION:", r));
process.on("uncaughtException", (e) => console.error("UNCAUGHT_EXCEPTION:", e));

// ===================== MONGO ÖN-SENKRON =====================
const { execSync } = require("child_process");
try {
  if ((process.env.MONGODB_URI || "").trim()) {
    execSync(`node "${__dirname}/mongo-sync-pull.js"`, { stdio: "inherit", env: process.env, timeout: 15000 });
  }
} catch (e) { console.error("⚠️ Mongo sync:", e.message); }

const fs = require("fs");
const path = require("path");
const express = require("express");
const { MongoClient } = require("mongodb");
const { joinVoiceChannel, getVoiceConnection } = require("@discordjs/voice");
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionsBitField, ChannelType, ActivityType,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, Events, REST, Routes, AttachmentBuilder
} = require("discord.js");

// ===================== FETCH FALLBACK =====================
let _fetch = global.fetch;
if (!_fetch) {
  try { _fetch = (...a) => import("node-fetch").then(({ default: f }) => f(...a)); }
  catch { console.error("❌ fetch yok!"); process.exit(1); }
}

// ===================== ENV =====================
const TOKEN = (process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN || "").trim();
const CLIENT_ID = (process.env.CLIENT_ID || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();
if (!TOKEN) { console.error("❌ TOKEN eksik!"); process.exit(1); }

// ===================== WEB PANEL + KEEP-ALIVE =====================
const BOT_START_TIME = Date.now();

// In-memory log ring buffer (web panel için)
const LOG_RING = [];
const LOG_MAX = 300;
function pushLog(category, action, detail) {
  LOG_RING.unshift({ category, action, detail, ts: Date.now() });
  if (LOG_RING.length > LOG_MAX) LOG_RING.pop();
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===================== SABITLER =====================
const OWNER_IDS = (process.env.OWNER_IDS || "827905938923978823,1129811807570247761").split(",").map(x => x.trim()).filter(Boolean);
const isOwner = (id) => OWNER_IDS.includes(id);
const BOT_IMAGE_URL = (process.env.BOT_IMAGE_URL || "").trim() || "https://media.discordapp.net/attachments/1525920078720143551/1525933790554231027/content.png?ex=6a665396&is=6a650216&hm=421ad16bdc2de1655f703a8d045c24f38b3e51e3dd858c804c8400cd9f9ce157&=&format=webp&quality=lossless&width=1872&height=749";
const TICKET_BANNER_URL = (process.env.TICKET_BANNER_URL || "").trim() || "https://media.discordapp.net/attachments/1525920078720143551/1525933790554231027/content.png?ex=6a665396&is=6a650216&hm=421ad16bdc2de1655f703a8d045c24f38b3e51e3dd858c804c8400cd9f9ce157&=&format=webp&quality=lossless&width=1872&height=749";
const PANEL_AUTHOR = (process.env.PANEL_AUTHOR || "Knesta Assistant").trim();
const FOOTER_TEXT = (process.env.FOOTER_TEXT || "Knesta • Assistant").trim();
const CFX_CODE = (process.env.CFX_CODE || "xjx5kr").trim();
const NAVY = 0x0b1a3a;

const EMOJI = {
  settings: "<a:settings:1520165591267414016>", success: "<a:success:1520165977227137075>",
  info: "<:info:1520167364379938896>", lock: "<a:lock_key:1520167477030686820>",
  right: "<a:sagok:1520167724355948744>", star: "<:yildiz:1520167832678301890>",
  warn: "<a:uyari1:1520167965343879328>", ban: "<:ban:1520168371096649728>",
  kick: "<:ban:1520168371096649728>", trash: "<:trash:1520169243314753547>",
  shield: "<:shield:1520169561683394761>", weed: "<:weed:1520169653358428351>",
  box: "<:box:1520169843452543169>", crown: "<a:crown:1520169978609799258>",
  refresh: "<:refresh:1520170092975882260>", headphones: "<:headphones:1520170199368601710>",
  muted: "<:muted:1520170268524281866>", unmute: "<:unmute:1520170332659646564>",
  move: "<a:sagok:1520167724355948744>", search: "<:search:1520171230009753770>",
  fivem: "<:fivem:1520171196518240546>"
};

// ===================== MONGODB =====================
const MONGODB_URI = (process.env.MONGODB_URI || "").trim();
const MONGODB_DB = (process.env.MONGODB_DB || "discord_bot").trim();
let mongoCol = null, mongoReady = false;

async function initMongo() {
  if (!MONGODB_URI) { console.log("ℹ️ MongoDB yok."); return; }
  try {
    const mc = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await mc.connect();
    mongoCol = mc.db(MONGODB_DB).collection("kv_store");
    mongoReady = true;
    console.log("✅ MongoDB OK");
  } catch (e) { console.error("❌ MongoDB:", e.message); }
}

async function pushToMongo(key, value) {
  if (!mongoReady) return;
  try { await mongoCol.updateOne({ _id: key }, { $set: { value, updatedAt: new Date() } }, { upsert: true }); }
  catch (e) { console.error("Mongo push:", e.message); }
}

// ===================== DATA =====================
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) { fs.writeFileSync(file, JSON.stringify(fallback, null, 2)); return fallback; }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return fallback; }
}
function saveJSON(file, data, key) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
  pushToMongo(key || path.basename(file), data).catch(() => {});
}

const FILES = {
  config: path.join(DATA_DIR, "config.json"),
  guard: path.join(DATA_DIR, "guard.json"),
  whitelist: path.join(DATA_DIR, "whitelist.json"),
  staff: path.join(DATA_DIR, "staff.json"),
  inv: path.join(DATA_DIR, "envanter.json"),
  auth: path.join(DATA_DIR, "otyetki.json"),
  otlog: path.join(DATA_DIR, "otlog.json"),
  banaff: path.join(DATA_DIR, "banaff.json")
};

const config = loadJSON(FILES.config, {
  logChannelId: null, ticketCategoryId: null, ticketStaffRoleId: null,
  ekipRoleId: null, alincakRoleId: null, ticketSonucChannelId: null,
  aktiflikLogChannelId: null, banAffLogChannelId: null, logs: {}
});
const guardConfig = loadJSON(FILES.guard, {
  enabled: true, systems: { ban: true, kick: true, channel: true, role: true },
  limits: { ban: 2, kick: 3, channel: 1, role: 2 }, windowMinutes: 10
});
let whitelist = new Set(loadJSON(FILES.whitelist, []));
let staffIds = new Set(loadJSON(FILES.staff, ["1129811807570247761", "1395918752159236321", "689416586905649189", "1073527389545570315"]));
let envanter = loadJSON(FILES.inv, {});
let otYetkililer = loadJSON(FILES.auth, []);
let otLogChannelId = loadJSON(FILES.otlog, null);
let banAffRecords = loadJSON(FILES.banaff, []);

const saveConfig = () => saveJSON(FILES.config, config);
const saveGuard = () => saveJSON(FILES.guard, guardConfig);
const saveWhitelist = () => saveJSON(FILES.whitelist, Array.from(whitelist));
const saveStaff = () => saveJSON(FILES.staff, Array.from(staffIds));
const saveEnvanter = () => saveJSON(FILES.inv, envanter);
const saveAuth = () => saveJSON(FILES.auth, otYetkililer);
const saveBanAff = () => saveJSON(FILES.banaff, banAffRecords);

const isStaff = (id) => isOwner(id) || staffIds.has(id);
const isOtYetkili = (id) => otYetkililer.includes(id);

// ===================== CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildBans, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ===================== STATE =====================
const ticketOwners = new Map();
const pendingRejects = new Map();
const ingameList = new Map();
const etkinlikList = new Map();
const aktiflikList = new Map();
const voiceBlockedUsers = new Set();
const guardCounters = new Map();
const activityStats = new Map();
let maintenanceMode = false;
const urlProtection = { enabled: false };
let lastPlayersFetchAt = 0, cachedPlayersJson = null;

// ===================== HELPERS =====================
const formatNumber = (n) => Number(n || 0).toLocaleString("tr-TR");
const line = (e, t) => `${e} ・ ${t}`;

function baseEmbed(guild) {
  const icon = guild?.iconURL?.({ size: 128 });
  return new EmbedBuilder().setColor(NAVY).setThumbnail(BOT_IMAGE_URL)
    .setAuthor({ name: PANEL_AUTHOR, iconURL: icon || undefined })
    .setFooter({ text: FOOTER_TEXT }).setTimestamp();
}
function createEmbed(guild, { title, description, fields, image } = {}) {
  const e = baseEmbed(guild);
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (fields?.length) e.addFields(fields);
  if (image) e.setImage(image);
  return e;
}
async function replyE(interaction, embed, ephemeral = false) {
  const p = { embeds: [embed] };
  if (ephemeral) p.flags = 64;
  if (interaction.deferred || interaction.replied) return interaction.editReply(p).catch(() => {});
  return interaction.reply(p).catch(() => {});
}
function noPerm(interaction) {
  return replyE(interaction, createEmbed(interaction.guild, {
    title: line(EMOJI.lock, "ʏᴇᴛᴋɪ ʏᴏᴋ"),
    description: line(EMOJI.warn, "Bu komutu kullanma yetkin yok.")
  }), true);
}
async function sendLog(guild, embed) {
  const id = config.logChannelId || config.logs?.guardLog;
  const ch = id && guild.channels.cache.get(id);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}
async function sendOtLog(guild, embed) {
  const ch = otLogChannelId && guild.channels.cache.get(otLogChannelId);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

// ===================== GUARD =====================
const isGuardOwner = (id) => isOwner(id) || whitelist.has(id);
const isGuardEnabled = (k) => guardConfig.enabled && !!guardConfig.systems?.[k];
const getLimit = (k) => { const n = Number(guardConfig.limits?.[k] ?? 0); return isNaN(n) ? 0 : Math.max(0, n | 0); };

function ensureCounter(guildId, userId) {
  if (!guardCounters.has(guildId)) guardCounters.set(guildId, new Map());
  const b = guardCounters.get(guildId);
  if (!b.has(userId)) b.set(userId, { ban: 0, kick: 0, channel: 0, role: 0, lastReset: Date.now() });
  return b.get(userId);
}
function resetIfNeeded(c) {
  const ms = Math.max(1, Number(guardConfig.windowMinutes || 10)) * 60000;
  if (Date.now() - c.lastReset >= ms) Object.assign(c, { ban: 0, kick: 0, channel: 0, role: 0, lastReset: Date.now() });
}
async function guardHit(guild, execId, key, reason) {
  if (!guild || !execId || isGuardOwner(execId)) return;
  const limit = getLimit(key);
  if (!limit) return;
  const c = ensureCounter(guild.id, execId);
  resetIfNeeded(c);
  c[key] = (c[key] || 0) + 1;
  pushLog("guard", `ALARM [${key.toUpperCase()}]`, `Yapan: ${execId} | ${reason} | ${c[key]}/${limit}`);
  await sendLog(guild, createEmbed(guild, {
    title: line(EMOJI.warn, "ɢᴜᴀʀᴅ ᴀʟᴀʀᴍ"),
    description: `${EMOJI.info} ・ İşlem: **${key.toUpperCase()}**\n${EMOJI.right} ・ Yapan: <@${execId}>\n${EMOJI.settings} ・ Sayaç: **${c[key]}/${limit}**\n${EMOJI.warn} ・ Sebep: **${reason}**`
  }));
  if (c[key] >= limit) {
    let punished = false;
    try {
      const m = await guild.members.fetch(execId).catch(() => null);
      if (m && !isGuardOwner(m.id)) { await m.kick(`GUARD: ${reason}`).catch(() => {}); punished = true; }
    } catch {}
    pushLog("guard", "MÜDAHALESİ", `${execId} → ${punished ? "kick edildi" : "bulunamadı"}`);
    await sendLog(guild, createEmbed(guild, {
      title: line(EMOJI.lock, "ɢᴜᴀʀᴅ ᴍᴜᴅᴀʜᴀʟᴇ"),
      description: `${EMOJI.success} ・ Limit aşıldı.\n${EMOJI.right} ・ <@${execId}>\n${EMOJI.info} ・ Sonuç: **${punished ? "Kick" : "Bulunamadı"}**`
    }));
  }
}
function guardPanelEmbed(guild) {
  const on = `${EMOJI.success} ・ **AÇIK**`, off = `${EMOJI.warn} ・ **KAPALI**`;
  const w = Math.max(1, Number(guardConfig.windowMinutes || 10));
  return createEmbed(guild, {
    title: line(EMOJI.shield, "ɢᴜᴀʀᴅ ᴘᴀɴᴇʟ"),
    description:
      `${EMOJI.ban} ・ Ban Guard: ${isGuardEnabled("ban") ? on : off}\n` +
      `${EMOJI.kick} ・ Kick Guard: ${isGuardEnabled("kick") ? on : off}\n` +
      `${EMOJI.trash} ・ Kanal Guard: ${isGuardEnabled("channel") ? on : off}\n` +
      `${EMOJI.crown} ・ Rol Guard: ${isGuardEnabled("role") ? on : off}\n\n` +
      `${EMOJI.info} ・ **Limitler (/${w} dk)**\n` +
      `Ban: **${getLimit("ban")}** | Kick: **${getLimit("kick")}** | Kanal: **${getLimit("channel")}** | Rol: **${getLimit("role")}**\n\n` +
      `${EMOJI.shield} ・ Whitelist: **${whitelist.size}** kişi`
  });
}

// ===================== ACTIVITY =====================
const ensureActivity = (id) => { if (!activityStats.has(id)) activityStats.set(id, { lastMessageAt: null, lastVoiceJoinAt: null, ingameCount: 0 }); return activityStats.get(id); };
const touchLastMessage = (id) => { ensureActivity(id).lastMessageAt = Date.now(); };
const touchLastVoiceJoin = (id) => { ensureActivity(id).lastVoiceJoinAt = Date.now(); };
const touchIngameJoin = (id) => { ensureActivity(id).ingameCount += 1; };
function formatAgo(ms) {
  if (!ms) return "Hiç";
  const d = Date.now() - ms;
  if (d < 0) return "Az önce";
  const min = Math.floor(d / 60000);
  if (min < 1) return "Az önce";
  if (min < 60) return `${min} dakika önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

// ===================== DURATION =====================
function parseDurationToMs(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(",", ".");
  let ms = 0, ok = false;
  const d = t.match(/(\d+(?:\.\d+)?)\s*(g|gün|gun|d|day)\b/);
  const h = t.match(/(\d+(?:\.\d+)?)\s*(sa|saat|h|hr|hour)\b/);
  const m = t.match(/(\d+(?:\.\d+)?)\s*(dk|dak|dakika|m|min)\b/);
  if (d) { ms += parseFloat(d[1]) * 86400000; ok = true; }
  if (h) { ms += parseFloat(h[1]) * 3600000; ok = true; }
  if (m) { ms += parseFloat(m[1]) * 60000; ok = true; }
  if (ok) return ms;
  const n = t.match(/^(\d+(?:\.\d+)?)$/);
  return n ? parseFloat(n[1]) * 60000 : null;
}
function formatRemaining(ms) {
  if (ms <= 0) return "Süre doldu";
  const tm = Math.ceil(ms / 60000), h = Math.floor(tm / 60), m = tm % 60;
  if (h > 0 && m > 0) return `${h} saat ${m} dakika sonra`;
  if (h > 0) return `${h} saat sonra`;
  return `${m} dakika sonra`;
}

// ===================== TICKET HELPERS =====================
async function generateTranscript(channel) {
  const msgs = [];
  let lastId;
  while (true) {
    const opts = { limit: 100 };
    if (lastId) opts.before = lastId;
    const batch = await channel.messages.fetch(opts).catch(() => null);
    if (!batch || !batch.size) break;
    msgs.push(...batch.values());
    lastId = batch.last()?.id;
    if (batch.size < 100) break;
  }
  msgs.reverse();
  const header = `=== Ticket Transcript: ${channel.name} ===\n=== ${new Date().toLocaleString("tr-TR")} ===\n\n`;
  const lines = msgs.map(msg => {
    const t = new Date(msg.createdTimestamp).toLocaleString("tr-TR");
    let c = msg.content || "";
    if (msg.embeds.length) c += (c ? " " : "") + "[Embed]";
    if (msg.attachments.size) c += (c ? " " : "") + "[Dosya]";
    return `[${t}] ${msg.author.tag}: ${c || "[Boş]"}`;
  });
  return Buffer.from(header + lines.join("\n"), "utf-8");
}

async function sendTicketLog(guild, channel, closerId) {
  const logCh = config.logs?.ticketLog && guild.channels.cache.get(config.logs.ticketLog);
  if (!logCh) return;
  const opener = ticketOwners.get(channel.id);
  const openedAt = opener ? new Date(opener.openedAt).toLocaleString("tr-TR") : "?";
  const closedAt = new Date().toLocaleString("tr-TR");
  const transcriptBuf = await generateTranscript(channel).catch(() => null);
  const embed = createEmbed(guild, {
    title: `📋 ・ ʙᴀşᴠᴜʀᴜ ʟᴏɢᴜ`,
    description:
      `${EMOJI.info} ・ **Bileti Açan Kişi:** ${opener ? `<@${opener.openerId}>` : "?"}\n` +
      `${EMOJI.info} ・ **Bileti Kapatan:** <@${closerId}>\n` +
      `${EMOJI.right} ・ **Açılış Tarihi:** ${openedAt}\n` +
      `${EMOJI.right} ・ **Kapanış Tarihi:** ${closedAt}`,
    image: TICKET_BANNER_URL
  });
  pushLog("ticket", "Ticket Kapatıldı", `Açan: ${opener?.openerId} | Kapatan: ${closerId}`);
  const transcriptBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("transcript_ph").setLabel("Ticket Transcript Geçmişi").setStyle(ButtonStyle.Secondary).setEmoji("📄").setDisabled(true)
  );
  const opts = { embeds: [embed], components: [transcriptBtn] };
  if (transcriptBuf) opts.files = [new AttachmentBuilder(transcriptBuf, { name: `transcript-${channel.name}.txt` })];
  await logCh.send(opts).catch(() => {});
}

// ===================== INGAME =====================
function ingameRows(closed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ingame_join").setLabel("Katıl").setStyle(ButtonStyle.Success).setEmoji("✅").setDisabled(!!closed),
    new ButtonBuilder().setCustomId("ingame_leave").setLabel("Ayrıl").setStyle(ButtonStyle.Danger).setEmoji("🚪").setDisabled(!!closed),
    new ButtonBuilder().setCustomId("ingame_info").setLabel("Bilgi").setStyle(ButtonStyle.Secondary).setEmoji("ℹ️"),
    new ButtonBuilder().setCustomId("ingame_cancel").setLabel("İPTAL ET").setStyle(ButtonStyle.Danger).setEmoji("🔴").setDisabled(!!closed)
  );
}
function ingameEmbed(guild, data) {
  const list = data.users.length ? data.users.map((id, i) => `**${i + 1}.** <@${id}>`).join("\n") : `${EMOJI.warn} ・ Henüz katılan yok.`;
  const rem = data.endsAt ? data.endsAt - Date.now() : null;
  return createEmbed(guild, {
    title: line(EMOJI.star, data.title),
    description: `\`[ MAIN KADRO: ${data.users.length} / ${data.limit} ]\`\n\n${EMOJI.info} ・ **Süre:** ${data.closed ? "Kapandı" : (rem !== null ? formatRemaining(rem) : "Belirsiz")}\n\n${EMOJI.right} ・ **Katılımcılar**\n${list}`,
    image: TICKET_BANNER_URL
  });
}
async function refreshIngame(guild, msgId) {
  const data = ingameList.get(msgId);
  if (!data) return;
  const ch = guild.channels.cache.get(data.channelId);
  if (!ch) return;
  const msg = await ch.messages.fetch(msgId).catch(() => null);
  if (msg) await msg.edit({ embeds: [ingameEmbed(guild, data)], components: [ingameRows(data.closed)] }).catch(() => {});
}
async function closeIngame(guild, msgId, reason) {
  const data = ingameList.get(msgId);
  if (!data || data.closed) return;
  data.closed = true;
  if (data.timer) { clearTimeout(data.timer); data.timer = null; }
  await refreshIngame(guild, msgId);
  const ch = guild.channels.cache.get(data.channelId);
  if (ch) await ch.send({ embeds: [createEmbed(guild, { title: line(EMOJI.lock, "ᴀʟɪᴍʟᴀʀ ᴋᴀᴘᴀɴᴅɪ"), description: `${EMOJI.info} ・ **${data.title}** alımları kapandı.\n${EMOJI.right} ・ ${reason}` })] }).catch(() => {});
}

// ===================== AKTİFLİK =====================
function aktiflikRows(closed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("aktiflik_join").setLabel("Aktifliğe Katıl").setStyle(ButtonStyle.Success).setEmoji("✅").setDisabled(!!closed),
    new ButtonBuilder().setCustomId("aktiflik_cancel").setLabel("İptal Et").setStyle(ButtonStyle.Danger).setEmoji("🔴").setDisabled(!!closed)
  );
}
function aktiflikEmbed(guild, data) {
  const rem = data.endsAt - Date.now();
  return createEmbed(guild, {
    title: line(EMOJI.star, "ᴀᴋᴛɪꜰʟɪᴋ ᴛᴇꜱᴛɪ ʙᴀşʟᴀᴅɪ"),
    description: `<@&${data.roleId}> ・ rolüne sahip kişilerin katılımı **ZORUNLUDUR**.\n${EMOJI.right} ・ Butona tıklayarak katılın.\n${EMOJI.warn} ・ Katılmayanlar tespit edilir.\n\n${EMOJI.info} ・ **Bitiş:** ${data.closed ? "Sona erdi" : formatRemaining(rem > 0 ? rem : 0)}\n${EMOJI.right} ・ **Katılımcı:** ${data.joined.size} kişi`,
    image: TICKET_BANNER_URL
  });
}
async function refreshAktiflik(guild, msgId) {
  const data = aktiflikList.get(msgId);
  if (!data) return;
  const ch = guild.channels.cache.get(data.channelId);
  if (!ch) return;
  const msg = await ch.messages.fetch(msgId).catch(() => null);
  if (msg) await msg.edit({ embeds: [aktiflikEmbed(guild, data)], components: [aktiflikRows(data.closed)] }).catch(() => {});
}
async function closeAktiflik(guild, msgId, reason) {
  const data = aktiflikList.get(msgId);
  if (!data || data.closed) return;
  data.closed = true;
  if (data.timer) { clearTimeout(data.timer); data.timer = null; }
  await refreshAktiflik(guild, msgId);
  const announceCh = guild.channels.cache.get(data.channelId);
  const logCh = config.aktiflikLogChannelId && guild.channels.cache.get(config.aktiflikLogChannelId);
  const role = guild.roles.cache.get(data.roleId);
  if (!role) { if (announceCh) await announceCh.send({ embeds: [createEmbed(guild, { title: line(EMOJI.warn, "ʜᴀᴛᴀ"), description: "Rol bulunamadı." })] }).catch(() => {}); return; }
  let members;
  try { members = await guild.members.fetch(); } catch { members = guild.members.cache; }
  const roleMembers = members.filter(m => !m.user.bot && m.roles.cache.has(data.roleId));
  const notJoined = roleMembers.filter(m => !data.joined.has(m.id));
  if (announceCh) await announceCh.send({ embeds: [createEmbed(guild, { title: line(EMOJI.lock, "ᴀᴋᴛɪꜰʟɪᴋ ᴛᴇꜱᴛɪ ꜱᴏɴᴜ"), description: `${EMOJI.right} ・ <@&${data.roleId}> testi sona erdi.\n${EMOJI.warn} ・ **${notJoined.size}** kişi katılmadı.\n${EMOJI.info} ・ ${reason}` })] }).catch(() => {});
  if (!logCh) return;
  for (const [, member] of notJoined) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`aktiflik_kick_${member.id}_${data.roleId}`).setLabel("Ekipten At").setStyle(ButtonStyle.Danger).setEmoji("🚫"),
      new ButtonBuilder().setCustomId(`aktiflik_stats_${member.id}`).setLabel("İstatistikler").setStyle(ButtonStyle.Primary).setEmoji("📊")
    );
    await logCh.send({ embeds: [createEmbed(guild, { title: line(EMOJI.warn, "[AKTİFLİK SONUCU]"), description: `${EMOJI.right} ・ ${member} \`(${member.id})\` aktiflik testine **katılmadı**.` })], components: [row] }).catch(() => {});
  }
}
function statsEmbed(guild, member) {
  const s = activityStats.get(member.id) || { lastMessageAt: null, lastVoiceJoinAt: null, ingameCount: 0 };
  return createEmbed(guild, {
    title: line(EMOJI.search, "ᴋᴜʟʟᴀɴɪᴄɪ ᴀᴋᴛɪꜰʟɪᴋ ɪꜱᴛᴀᴛɪꜱᴛɪɢɪ"),
    description: `${member} adlı üyenin analizi:\n\n${EMOJI.right} ・ **Son Mesaj:** ${formatAgo(s.lastMessageAt)}\n${EMOJI.headphones} ・ **Son Ses:** ${formatAgo(s.lastVoiceJoinAt)}\n${EMOJI.star} ・ **İngame Katılım:** ${s.ingameCount} defa`
  });
}

// ===================== BAN AFFİ =====================
const PAGE_SIZE = 4;
function banListEmbed(guild, page) {
  const total = banAffRecords.length, pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages), start = (p - 1) * PAGE_SIZE;
  const recs = banAffRecords.slice(start, start + PAGE_SIZE);
  const desc = total === 0 ? `${EMOJI.info} ・ Kayıt yok.` :
    recs.map((r, i) => `**${start + i + 1}. Banlı:** <@${r.userId}>\n**Tarih:** ${new Date(r.createdAt).toLocaleDateString("tr-TR")}\n**Sebep:**\n\`\`\`${r.reason}\`\`\``).join("\n\n");
  return createEmbed(guild, { title: line(EMOJI.ban, "ᴅᴇᴛᴀʏʟɪ ʙᴀɴ ʟɪꜱᴛ"), description: desc, fields: [{ name: "Toplam", value: `\`${total}\``, inline: true }] });
}
function banListRows(page) {
  const total = banAffRecords.length, pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`banlist_prev_${page}`).setLabel("◄").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`banlist_page_${page}`).setLabel(`${page}/${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`banlist_next_${page}`).setLabel("►").setStyle(ButtonStyle.Secondary).setDisabled(page >= pages)
  );
}

// ===================== FiveM =====================
const cleanFiveMName = (n = "") => String(n).replace(/\^\d/g, "").toLowerCase();
async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await _fetch(url, { ...opts, signal: c.signal }); }
  finally { clearTimeout(t); }
}
async function getPlayers() {
  if (cachedPlayersJson && Date.now() - lastPlayersFetchAt < 30000) return cachedPlayersJson;
  const res = await fetchWithTimeout(`https://servers-frontend.fivem.net/api/servers/single/${CFX_CODE}`, {}, 5000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  cachedPlayersJson = await res.json();
  lastPlayersFetchAt = Date.now();
  return cachedPlayersJson;
}
async function getPlayer(id) {
  const json = await getPlayers();
  const p = (json?.Data?.players || []).find(x => String(x.id) === String(id));
  if (!p) return { found: false };
  const ids = Array.isArray(p.identifiers) ? p.identifiers : [];
  return { found: true, id: p.id, name: p.name, ping: p.ping, steam: ids.find(i => i.startsWith("steam:")) || "Yok", discord: ids.find(i => i.startsWith("discord:"))?.replace("discord:", "") || "Yok" };
}

// ===================== OT =====================
function ensureUser(id) { if (!envanter[id]) envanter[id] = { ot: 0 }; if (typeof envanter[id].ot !== "number") envanter[id].ot = 0; }

// ===================== API ROUTES (BEFORE STATIC) =====================
app.get("/api/dashboard", async (req, res) => {
  try {
    let fivemData = { playerCount: 0, maxPlayers: 0, avgPing: 0, online: false };
    try {
      const json = await getPlayers();
      const players = json?.Data?.players || [];
      const sv = json?.Data?.sv_maxclients || json?.Data?.svMaxclients || 128;
      fivemData = {
        playerCount: players.length,
        maxPlayers: Number(sv) || 128,
        avgPing: players.length ? Math.round(players.reduce((a, p) => a + (p.ping || 0), 0) / players.length) : 0,
        online: true
      };
    } catch {}
    const uptimeSec = Math.floor((Date.now() - BOT_START_TIME) / 1000);
    const h = Math.floor(uptimeSec / 3600), m = Math.floor((uptimeSec % 3600) / 60), s = uptimeSec % 60;
    res.json({
      fivem: fivemData,
      bot: {
        online: client.isReady(),
        uptime: `${h}s ${m}dk ${s}sn`,
        uptimeMs: Date.now() - BOT_START_TIME,
        ping: client.ws.ping,
        maintenance: maintenanceMode
      },
      stats: {
        staffCount: staffIds.size,
        banAffCount: banAffRecords.length,
        activeIngame: Array.from(ingameList.values()).filter(d => !d.closed).length,
        activeEtkinlik: Array.from(etkinlikList.values()).filter(d => !d.closed).length,
        activeAktiflik: Array.from(aktiflikList.values()).filter(d => !d.closed).length,
        whitelistCount: whitelist.size
      },
      recentLogs: LOG_RING.slice(0, 10)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/fivem/players", async (req, res) => {
  try {
    const json = await getPlayers();
    const players = (json?.Data?.players || []).map(p => {
      const ids = Array.isArray(p.identifiers) ? p.identifiers : [];
      return {
        id: p.id, name: p.name, ping: p.ping,
        steam: ids.find(i => i.startsWith("steam:")) || null,
        discord: ids.find(i => i.startsWith("discord:"))?.replace("discord:", "") || null,
        license: ids.find(i => i.startsWith("license:")) || null
      };
    });
    const sv = json?.Data?.sv_maxclients || json?.Data?.svMaxclients || 128;
    res.json({ players, maxPlayers: Number(sv), total: players.length, online: true, cachedAt: lastPlayersFetchAt });
  } catch (e) { res.status(503).json({ error: e.message, online: false, players: [], total: 0 }); }
});

app.get("/api/fivem/player/:id", async (req, res) => {
  try { res.json(await getPlayer(req.params.id)); }
  catch (e) { res.status(503).json({ error: e.message, found: false }); }
});

app.get("/api/fivem/tag/:name", async (req, res) => {
  try {
    const search = decodeURIComponent(req.params.name).toLowerCase();
    const json = await getPlayers();
    const results = (json?.Data?.players || [])
      .filter(p => cleanFiveMName(p.name).includes(search))
      .slice(0, 50)
      .map(p => {
        const ids = Array.isArray(p.identifiers) ? p.identifiers : [];
        return { id: p.id, name: p.name, ping: p.ping, discord: ids.find(i => i.startsWith("discord:"))?.replace("discord:", "") || null };
      });
    res.json({ results, total: results.length });
  } catch (e) { res.status(503).json({ error: e.message, results: [], total: 0 }); }
});

app.get("/api/team", (req, res) => {
  const staff = Array.from(staffIds).map(id => ({
    id, isOwner: isOwner(id),
    ot: envanter[id]?.ot || 0,
    activity: activityStats.get(id) || { lastMessageAt: null, lastVoiceJoinAt: null, ingameCount: 0 }
  }));
  res.json({ staff, owners: OWNER_IDS, total: staff.length });
});

app.get("/api/events", (req, res) => {
  res.json({
    ingames: Array.from(ingameList.entries()).map(([msgId, d]) => ({
      msgId, title: d.title, limit: d.limit, joined: d.users.length,
      closed: d.closed, endsAt: d.endsAt, channelId: d.channelId,
      remaining: d.endsAt ? Math.max(0, d.endsAt - Date.now()) : null
    })),
    etkinlikler: Array.from(etkinlikList.entries()).map(([msgId, d]) => ({
      msgId, title: d.title, limit: d.limit, joined: d.users.length, closed: d.closed
    })),
    aktiflikler: Array.from(aktiflikList.entries()).map(([msgId, d]) => ({
      msgId, roleId: d.roleId, joined: d.joined.size, closed: d.closed,
      endsAt: d.endsAt, remaining: Math.max(0, d.endsAt - Date.now())
    }))
  });
});

app.get("/api/activity", (req, res) => {
  const stats = Array.from(activityStats.entries()).map(([userId, s]) => ({
    userId, lastMessageAt: s.lastMessageAt, lastVoiceJoinAt: s.lastVoiceJoinAt,
    ingameCount: s.ingameCount, lastMessageAgo: formatAgo(s.lastMessageAt), lastVoiceAgo: formatAgo(s.lastVoiceJoinAt)
  })).sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  res.json({ stats, total: stats.length });
});

app.get("/api/ban-aff", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const start = (page - 1) * limit;
  res.json({ records: banAffRecords.slice(start, start + limit), total: banAffRecords.length, page, limit, pages: Math.max(1, Math.ceil(banAffRecords.length / limit)) });
});

app.get("/api/guard", (req, res) => {
  res.json({ enabled: guardConfig.enabled, systems: guardConfig.systems, limits: guardConfig.limits, windowMinutes: guardConfig.windowMinutes, whitelistCount: whitelist.size, whitelist: Array.from(whitelist) });
});

app.get("/api/logs", (req, res) => {
  const category = req.query.category;
  const logs = category ? LOG_RING.filter(l => l.category === category) : LOG_RING;
  res.json({ logs: logs.slice(0, 100), total: logs.length });
});

app.get("/api/ot", (req, res) => {
  const arr = Object.entries(envanter).map(([id, d]) => ({ id, ot: d?.ot || 0 })).sort((a, b) => b.ot - a.ot);
  res.json({ envanter: arr, total: arr.length });
});

app.get("/api/config", (req, res) => {
  res.json({ cfxCode: CFX_CODE, panelAuthor: PANEL_AUTHOR, maintenance: maintenanceMode, logChannels: Object.keys(config.logs || {}) });
});

// ===================== STATIC + SPA FALLBACK =====================
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
app.use(express.static(PUBLIC_DIR));

app.get("*", (req, res) => {
  const idx = path.join(PUBLIC_DIR, "index.html");
  if (fs.existsSync(idx)) res.sendFile(idx);
  else res.status(200).send("TeamCruz Bot — Panel yükleniyor.");
});

// ===================== EXPRESS LISTEN =====================
app.listen(process.env.PORT || 10000, "0.0.0.0", () =>
  console.log("🌐 Web panel aktif: port " + (process.env.PORT || 10000))
);

// ===================== SLASH COMMANDS =====================
const commands = [
  new SlashCommandBuilder().setName("guard").setDescription("Guard sistemi")
    .addSubcommand(s => s.setName("panel").setDescription("Guard paneli"))
    .addSubcommand(s => s.setName("limit").setDescription("Limit ayarla")
      .addStringOption(o => o.setName("sistem").setDescription("Sistem").setRequired(true).addChoices({ name: "Ban", value: "ban" }, { name: "Kick", value: "kick" }, { name: "Kanal", value: "channel" }, { name: "Rol", value: "role" }))
      .addIntegerOption(o => o.setName("miktar").setDescription("Limit").setRequired(true).setMinValue(0)))
    .addSubcommand(s => s.setName("sistem").setDescription("Aç/kapat")
      .addStringOption(o => o.setName("sistem").setDescription("Sistem").setRequired(true).addChoices({ name: "Ban", value: "ban" }, { name: "Kick", value: "kick" }, { name: "Kanal", value: "channel" }, { name: "Rol", value: "role" }))
      .addBooleanOption(o => o.setName("durum").setDescription("Açık mı?").setRequired(true)))
    .addSubcommand(s => s.setName("whitelist").setDescription("Whitelist yönet")
      .addStringOption(o => o.setName("islem").setDescription("İşlem").setRequired(true).addChoices({ name: "Ekle", value: "ekle" }, { name: "Kaldır", value: "kaldir" }, { name: "Liste", value: "liste" }))
      .addUserOption(o => o.setName("kullanici").setDescription("Kullanıcı"))),
  new SlashCommandBuilder().setName("setup").setDescription("Log kanallarını kur").setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName("logkur").setDescription("Guard log kanalı").addChannelOption(o => o.setName("kanal").setDescription("Kanal").setRequired(true).addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("ticketkategori").setDescription("Ticket kategorisi").addChannelOption(o => o.setName("kategori").setDescription("Kategori").setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
  new SlashCommandBuilder().setName("basvurupanel").setDescription("Başvuru paneli gönder").addRoleOption(o => o.setName("yetkili_rol").setDescription("Yetkili rol").setRequired(true)),
  new SlashCommandBuilder().setName("ticketsonuckur").setDescription("Kabul/red bildirim kanalı").addChannelOption(o => o.setName("kanal").setDescription("Kanal").setRequired(true).addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("ekiprolkur").setDescription("Kabul edilince verilecek rol").addRoleOption(o => o.setName("rol").setDescription("Rol").setRequired(true)),
  new SlashCommandBuilder().setName("alincakrolkur").setDescription("Kabul edilince ALINACAK rol").addRoleOption(o => o.setName("rol").setDescription("Rol").setRequired(true)),
  new SlashCommandBuilder().setName("yetkili").setDescription("Yetkili yönetimi").setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand(s => s.setName("ekle").setDescription("Yetkili ekle").addUserOption(o => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)))
    .addSubcommand(s => s.setName("kaldir").setDescription("Yetkili kaldır").addUserOption(o => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)))
    .addSubcommand(s => s.setName("liste").setDescription("Yetkili listesi")),
  new SlashCommandBuilder().setName("otyetki").setDescription("OT yetki yönetimi")
    .addSubcommand(s => s.setName("ekle").setDescription("OT yetki ekle").addUserOption(o => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)))
    .addSubcommand(s => s.setName("kaldir").setDescription("OT yetki kaldır").addUserOption(o => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)))
    .addSubcommand(s => s.setName("liste").setDescription("OT yetkili listesi")),
  new SlashCommandBuilder().setName("ot").setDescription("OT ekle/çıkar").addUserOption(o => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)).addIntegerOption(o => o.setName("miktar").setDescription("Miktar (negatif=çıkar)").setRequired(true)),
  new SlashCommandBuilder().setName("envanter").setDescription("OT bakiyeni gör"),
  new SlashCommandBuilder().setName("top10ot").setDescription("Top 10 OT"),
  new SlashCommandBuilder().setName("otreset").setDescription("OT sıfırla").addUserOption(o => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)),
  new SlashCommandBuilder().setName("otlogkur").setDescription("OT log kanalı").addChannelOption(o => o.setName("kanal").setDescription("Kanal").setRequired(true).addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("aktiflik").setDescription("Aktiflik testi")
    .addSubcommand(s => s.setName("baslat").setDescription("Testi başlat").addRoleOption(o => o.setName("rol").setDescription("Rol").setRequired(true)).addStringOption(o => o.setName("sure").setDescription("Süre (30dk, 2sa, 3g)").setRequired(true)))
    .addSubcommand(s => s.setName("log").setDescription("Log kanalı").addChannelOption(o => o.setName("kanal").setDescription("Kanal").setRequired(true).addChannelTypes(ChannelType.GuildText))),
  new SlashCommandBuilder().setName("banaffpanel").setDescription("Ban affı paneli gönder"),
  new SlashCommandBuilder().setName("banafflogkur").setDescription("Ban affı log kanalı").addChannelOption(o => o.setName("kanal").setDescription("Kanal").setRequired(true).addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("bansorgu").setDescription("Ban affı talebi sorgula").addStringOption(o => o.setName("kullanici_id").setDescription("Kullanıcı ID").setRequired(true)),
  new SlashCommandBuilder().setName("banaffisil").setDescription("Ban affı kaydını sil").addStringOption(o => o.setName("kullanici_id").setDescription("Kullanıcı ID").setRequired(true)),
  new SlashCommandBuilder().setName("banaffsifirla").setDescription("Tüm ban affı kayıtlarını temizle"),
  new SlashCommandBuilder().setName("banlist").setDescription("Ban affı listesi"),
  new SlashCommandBuilder().setName("sil").setDescription("Toplu mesaj sil").addIntegerOption(o => o.setName("miktar").setDescription("1-100").setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName("kick").setDescription("Kullanıcıyı at").addUserOption(o => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)).addStringOption(o => o.setName("sebep").setDescription("Sebep")),
  new SlashCommandBuilder().setName("ban").setDescription("Kullanıcıyı banla").addUserOption(o => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)).addStringOption(o => o.setName("sebep").setDescription("Sebep")),
  new SlashCommandBuilder().setName("nuke").setDescription("Kanalı sil/yeniden oluştur"),
  new SlashCommandBuilder().setName("dm").setDescription("Role DM gönder").addRoleOption(o => o.setName("rol").setDescription("Rol").setRequired(true)).addStringOption(o => o.setName("mesaj").setDescription("Mesaj").setRequired(true)),
  new SlashCommandBuilder().setName("sesgir").setDescription("Botu ses kanalına sok"),
  new SlashCommandBuilder().setName("sescik").setDescription("Botu ses kanalından çıkar"),
  new SlashCommandBuilder().setName("allvmute").setDescription("Ses kanalındaki herkesi mutele"),
  new SlashCommandBuilder().setName("unvmuteall").setDescription("Ses kanalındaki herkesin mutesini aç"),
  new SlashCommandBuilder().setName("tasi").setDescription("Ses kanalındaki herkesi taşı").addChannelOption(o => o.setName("kanal").setDescription("Hedef ses kanalı").setRequired(true).addChannelTypes(ChannelType.GuildVoice)),
  new SlashCommandBuilder().setName("sesyasak").setDescription("Ses yasak yönetimi")
    .addSubcommand(s => s.setName("ekle").setDescription("Ses yasağı ekle").addUserOption(o => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)))
    .addSubcommand(s => s.setName("kaldir").setDescription("Ses yasağı kaldır").addUserOption(o => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)))
    .addSubcommand(s => s.setName("liste").setDescription("Ses yasak listesi")),
  new SlashCommandBuilder().setName("etkinlik").setDescription("Limitli etkinlik paneli").addStringOption(o => o.setName("baslik").setDescription("Başlık").setRequired(true)).addIntegerOption(o => o.setName("limit").setDescription("Maks katılımcı").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName("ingame").setDescription("Kadro paneli")
    .addSubcommand(s => s.setName("olustur").setDescription("Kadro paneli oluştur").addStringOption(o => o.setName("baslik").setDescription("Başlık").setRequired(true)).addIntegerOption(o => o.setName("limit").setDescription("Maks katılımcı").setRequired(true).setMinValue(1)).addStringOption(o => o.setName("sure").setDescription("Süre (2sa, 30dk) - boş=süresiz")))
    .addSubcommand(s => s.setName("iptal").setDescription("Aktif paneli iptal et")),
  new SlashCommandBuilder().setName("id").setDescription("FiveM id sorgu").addIntegerOption(o => o.setName("oyuncu_id").setDescription("FiveM ID").setRequired(true).setMinValue(0)),
  new SlashCommandBuilder().setName("tag").setDescription("FiveM Tag Sorgu").addStringOption(o => o.setName("arama").setDescription("Aranacak isim").setRequired(true)),
  new SlashCommandBuilder().setName("ping").setDescription("Bot gecikmesi"),
  new SlashCommandBuilder().setName("test").setDescription("Bot test"),
  new SlashCommandBuilder().setName("bakim").setDescription("Bakım modunu aç/kapat"),
  new SlashCommandBuilder().setName("patlat").setDescription("???"),
  new SlashCommandBuilder().setName("yardim").setDescription("Komut listesi"),
  new SlashCommandBuilder().setName("urlkoruma").setDescription("URL korumayı aç/kapat"),
].map(c => c.toJSON());

async function registerCommands() {
  if (!CLIENT_ID) { console.warn("⚠️ CLIENT_ID yok, slash komutlar kaydedilmedi."); return; }
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log("✅ Slash komutlar kaydedildi (guild - anında).");
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log("✅ Slash komutlar kaydedildi (global ~1sa).");
    }
  } catch (e) { console.error("❌ Komut kaydı:", e.message); }
}

// ===================== INTERACTION HANDLER =====================
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.guild) return;
    const guild = interaction.guild;

    // ===== MODAL SUBMIT =====
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "banaff_modal") {
        await interaction.deferReply({ flags: 64 });
        const reason = interaction.fields.getTextInputValue("banaff_reason");
        const record = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), userId: interaction.user.id, userTag: interaction.user.tag, reason: reason.slice(0, 950), createdAt: Date.now() };
        banAffRecords.unshift(record);
        saveBanAff();
        pushLog("banaff", "Yeni Talep", `${interaction.user.tag} (${interaction.user.id})`);
        const logCh = config.banAffLogChannelId && guild.channels.cache.get(config.banAffLogChannelId);
        if (logCh) await logCh.send({ embeds: [createEmbed(guild, { title: line(EMOJI.ban, "ʏᴇɴɪ ʙᴀɴ ᴀꜰꜰɪ"), description: `${EMOJI.right} ・ <@${interaction.user.id}>\n${EMOJI.info} ・ Sebep:\n\`\`\`${record.reason}\`\`\`` })] }).catch(() => {});
        return interaction.editReply("✅ Ban kaydın alındı, ekibimiz inceleyecek.");
      }

      if (interaction.customId.startsWith("reddet_modal_")) {
        await interaction.deferReply({ flags: 64 });
        const applicantId = interaction.customId.replace("reddet_modal_", "");
        const reason = interaction.fields.getTextInputValue("reddet_sebep");
        const member = await guild.members.fetch(applicantId).catch(() => null);
        const pending = pendingRejects.get(applicantId);
        if (pending) {
          const ch = guild.channels.cache.get(pending.channelId);
          if (ch) {
            const msg = await ch.messages.fetch(pending.messageId).catch(() => null);
            if (msg) {
              const disRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("basvuru_kabul_done").setLabel("Kabul Et").setStyle(ButtonStyle.Success).setEmoji(EMOJI.success).setDisabled(true),
                new ButtonBuilder().setCustomId("basvuru_reddet_done").setLabel("Reddedildi").setStyle(ButtonStyle.Danger).setEmoji(EMOJI.warn).setDisabled(true),
                new ButtonBuilder().setCustomId("ticket_close").setLabel("Kapat & Sil").setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.lock)
              );
              await msg.edit({ components: [disRow] }).catch(() => {});
            }
          }
          pendingRejects.delete(applicantId);
        }
        if (interaction.channel) {
          await interaction.channel.send({ embeds: [createEmbed(guild, { title: line(EMOJI.warn, "ʙᴀşᴠᴜʀᴜ ʀᴇᴅᴅᴇᴅɪʟᴅɪ"), description: `${EMOJI.warn} ・ Başvuru **reddedildi** (<@${interaction.user.id}>).\n${EMOJI.info} ・ Sebep: **${reason}**` })] }).catch(() => {});
        }
        const sonucCh = config.ticketSonucChannelId && guild.channels.cache.get(config.ticketSonucChannelId);
        if (sonucCh) await sonucCh.send(`🟥 <@${applicantId}> başvurusu incelenmiş ve **${reason}** sebebiyle **reddedilmiştir**.`).catch(() => {});
        if (member) await member.send({ embeds: [createEmbed(guild, { title: line(EMOJI.warn, "ʙᴀşᴠᴜʀᴜɴ ʀᴇᴅᴅᴇᴅɪʟᴅɪ"), description: `${EMOJI.warn} ・ **${guild.name}** başvurun reddedildi.\n${EMOJI.info} ・ Sebep: **${reason}**` })] }).catch(() => {});
        pushLog("ticket", "Başvuru Reddedildi", `${applicantId} | Sebep: ${reason}`);
        return interaction.editReply(`🔴 Reddedildi (${reason}).`);
      }
      return;
    }

    // ===== BUTTONS =====
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === "ticket_open") {
        await interaction.deferReply({ flags: 64 });
        if (!config.ticketCategoryId || !config.ticketStaffRoleId) return interaction.editReply("Ticket sistemi ayarlı değil.");
        const cat = guild.channels.cache.get(config.ticketCategoryId);
        if (!cat) return interaction.editReply("Kategori geçersiz.");
        const safe = (interaction.user.username || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
        const name = `basvuru-${safe}`;
        const existing = guild.channels.cache.find(c => c.parentId === cat.id && c.name === name);
        if (existing) return interaction.editReply(`Zaten açık ticketin var: ${existing}`);
        const ch = await guild.channels.create({ name, parent: cat.id, type: ChannelType.GuildText, permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }, { id: config.ticketStaffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] });
        ticketOwners.set(ch.id, { openerId: interaction.user.id, openerTag: interaction.user.tag, openedAt: Date.now() });
        pushLog("ticket", "Ticket Açıldı", `${interaction.user.tag} (${interaction.user.id})`);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`basvuru_kabul_${interaction.user.id}`).setLabel("Kabul Et").setStyle(ButtonStyle.Success).setEmoji(EMOJI.success),
          new ButtonBuilder().setCustomId(`basvuru_reddet_${interaction.user.id}`).setLabel("Reddet").setStyle(ButtonStyle.Danger).setEmoji(EMOJI.warn),
          new ButtonBuilder().setCustomId("ticket_close").setLabel("Kapat & Sil").setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.lock)
        );
        const form = `> **_Günde kaç saat aktif olabilirsin?:_**\n> **_Kaç yaşındasın?:_**\n> **_Oynadığın ekipler:_**\n> **_FiveM'de kaç saatin var?:_**\n> **_Gelişmiş map bilgin var mı?:_**\n> **_Referansın var mı?:_**\n> **_En az 5/10 adet kill POV (zorunlu):_**\n> **_MDRP Banlı mısın?:_**`;
        await ch.send({ content: `<@${interaction.user.id}> | <@&${config.ticketStaffRoleId}>`, embeds: [createEmbed(guild, { title: `Hoş Geldin, ${interaction.user.username}`, description: `**Başvuru Formu**\n\n*Formu doldurup yetkililerin cevap vermesini bekleyin.*\n\n${form}`, image: TICKET_BANNER_URL })], components: [row] });
        return interaction.editReply(`✅ Ticket açıldı: ${ch}`);
      }

      if (id.startsWith("basvuru_kabul_") && !id.endsWith("done")) {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!isStaff(interaction.user.id) && !isAdmin) return interaction.reply({ content: "❌ Yetkin yok.", flags: 64 });
        await interaction.deferReply({ flags: 64 });
        const applicantId = id.replace("basvuru_kabul_", "");
        const member = await guild.members.fetch(applicantId).catch(() => null);
        if (!member) return interaction.editReply("❌ Üye bulunamadı.");
        if (config.ekipRoleId && guild.roles.cache.has(config.ekipRoleId)) await member.roles.add(config.ekipRoleId).catch(() => {});
        if (config.alincakRoleId && guild.roles.cache.has(config.alincakRoleId)) await member.roles.remove(config.alincakRoleId).catch(() => {});
        const disRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("basvuru_kabul_done").setLabel("Kabul Edildi").setStyle(ButtonStyle.Success).setEmoji(EMOJI.success).setDisabled(true),
          new ButtonBuilder().setCustomId("basvuru_reddet_done").setLabel("Reddet").setStyle(ButtonStyle.Danger).setEmoji(EMOJI.warn).setDisabled(true),
          new ButtonBuilder().setCustomId("ticket_close").setLabel("Kapat & Sil").setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.lock)
        );
        await interaction.message.edit({ components: [disRow] }).catch(() => {});
        await interaction.channel.send({ embeds: [createEmbed(guild, { title: line(EMOJI.success, "ʙᴀşᴠᴜʀᴜ ᴋᴀʙᴜʟ ᴇᴅɪʟᴅɪ"), description: `${EMOJI.success} ・ ${member} başvurusu **kabul edildi** (<@${interaction.user.id}>).` })] }).catch(() => {});
        const sonucCh = config.ticketSonucChannelId && guild.channels.cache.get(config.ticketSonucChannelId);
        if (sonucCh) await sonucCh.send(`✅ <@${applicantId}> incelenip ekibe uygun görülmüş ve başvurusu **onaylanmıştır**.`).catch(() => {});
        await member.send({ embeds: [createEmbed(guild, { title: line(EMOJI.success, "ʙᴀşᴠᴜʀᴜɴ ᴋᴀʙᴜʟ ᴇᴅɪʟᴅɪ"), description: `${EMOJI.success} ・ **${guild.name}** başvurun kabul edildi! Aramıza hoş geldin.` })] }).catch(() => {});
        pushLog("ticket", "Başvuru Kabul Edildi", `${applicantId} | Yetkili: ${interaction.user.id}`);
        return interaction.editReply("✅ Kabul edildi.");
      }

      if (id.startsWith("basvuru_reddet_") && !id.endsWith("done")) {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!isStaff(interaction.user.id) && !isAdmin) return interaction.reply({ content: "❌ Yetkin yok.", flags: 64 });
        const applicantId = id.replace("basvuru_reddet_", "");
        pendingRejects.set(applicantId, { messageId: interaction.message.id, channelId: interaction.channel.id });
        const modal = new ModalBuilder().setCustomId(`reddet_modal_${applicantId}`).setTitle("Başvuru Red Sebebi");
        const inp = new TextInputBuilder().setCustomId("reddet_sebep").setLabel("Red sebebini yaz").setStyle(TextInputStyle.Paragraph).setPlaceholder("Örn: Yeterli deneyim yok, POV eksik vb.").setMinLength(3).setMaxLength(500).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(inp));
        return interaction.showModal(modal);
      }

      if (id === "ticket_close") {
        await interaction.deferReply({ flags: 64 });
        const opener = ticketOwners.get(interaction.channel.id);
        const admin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (opener && interaction.user.id !== opener.openerId && !admin && !isStaff(interaction.user.id)) return interaction.editReply("Yetkin yok.");
        await sendTicketLog(guild, interaction.channel, interaction.user.id).catch(() => {});
        await interaction.channel.delete().catch(() => {});
        ticketOwners.delete(interaction.channel.id);
        return;
      }

      if (id === "banaff_open") {
        const modal = new ModalBuilder().setCustomId("banaff_modal").setTitle("Ban Affı Formu");
        const inp = new TextInputBuilder().setCustomId("banaff_reason").setLabel("Ban sebebini detaylı açıkla").setStyle(TextInputStyle.Paragraph).setPlaceholder("Kim banladı, ne zaman, neden vb.").setMinLength(5).setMaxLength(950).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(inp));
        return interaction.showModal(modal);
      }

      if (id.startsWith("banlist_prev_") || id.startsWith("banlist_next_")) {
        if (!isStaff(interaction.user.id)) return interaction.reply({ content: "❌ Yetkin yok.", flags: 64 });
        const prev = id.startsWith("banlist_prev_");
        const cur = parseInt(id.replace(prev ? "banlist_prev_" : "banlist_next_", ""), 10) || 1;
        const np = prev ? cur - 1 : cur + 1;
        return interaction.update({ embeds: [banListEmbed(guild, np)], components: [banListRows(np)] }).catch(() => {});
      }

      if (id === "aktiflik_join") {
        const data = aktiflikList.get(interaction.message.id);
        if (!data) return interaction.reply({ content: "❌ Aktif değil.", flags: 64 });
        if (data.closed) return interaction.reply({ content: "🔒 Test sona erdi.", flags: 64 });
        if (data.joined.has(interaction.user.id)) return interaction.reply({ content: "⚠️ Zaten katıldın.", flags: 64 });
        data.joined.add(interaction.user.id);
        await refreshAktiflik(guild, interaction.message.id);
        return interaction.reply({ content: "✅ Aktiflik testine katılımın kaydedildi!", flags: 64 });
      }
      if (id === "aktiflik_cancel") {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!isStaff(interaction.user.id) && !isAdmin) return interaction.reply({ content: "❌ Yetkin yok.", flags: 64 });
        await interaction.deferReply({ flags: 64 });
        const data = aktiflikList.get(interaction.message.id);
        if (!data) return interaction.editReply("❌ Aktif değil.");
        if (data.closed) return interaction.editReply("⚠️ Zaten kapalı.");
        data.closed = true; if (data.timer) { clearTimeout(data.timer); data.timer = null; }
        await refreshAktiflik(guild, interaction.message.id);
        return interaction.editReply("🔴 Aktiflik testi iptal edildi.");
      }
      if (id.startsWith("aktiflik_kick_")) {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!isStaff(interaction.user.id) && !isAdmin) return interaction.reply({ content: "❌ Yetkin yok.", flags: 64 });
        await interaction.deferReply({ flags: 64 });
        const [targetId, roleId] = id.replace("aktiflik_kick_", "").split("_");
        const member = await guild.members.fetch(targetId).catch(() => null);
        if (!member) return interaction.editReply("❌ Üye bulunamadı.");
        await member.roles.remove(roleId).catch(() => {});
        return interaction.editReply(`🚫 ${member} ekipten çıkarıldı.`);
      }
      if (id.startsWith("aktiflik_stats_")) {
        const targetId = id.replace("aktiflik_stats_", "");
        const member = await guild.members.fetch(targetId).catch(() => null);
        if (!member) return interaction.reply({ content: "❌ Üye bulunamadı.", flags: 64 });
        return interaction.reply({ embeds: [statsEmbed(guild, member)], flags: 64 });
      }

      if (id === "ingame_join") {
        await interaction.deferReply({ flags: 64 });
        const msgId = interaction.message.id;
        const data = ingameList.get(msgId);
        if (!data) return interaction.editReply("❌ Aktif değil.");
        if (data.closed) return interaction.editReply("🔒 Alımlar kapandı.");
        if (data.users.includes(interaction.user.id)) return interaction.editReply("⚠️ Zaten katıldın.");
        if (data.users.length >= data.limit) { await closeIngame(guild, msgId, "Kontenjan doldu"); return interaction.editReply("🔒 Kontenjan doldu."); }
        data.users.push(interaction.user.id); touchIngameJoin(interaction.user.id);
        if (data.users.length >= data.limit) { await closeIngame(guild, msgId, "Kontenjan doldu"); return interaction.editReply("✅ Katıldın! (Son katılım, alımlar kapandı)"); }
        await refreshIngame(guild, msgId);
        return interaction.editReply(`✅ Katıldın! Sıran: **${data.users.length}**`);
      }
      if (id === "ingame_leave") {
        await interaction.deferReply({ flags: 64 });
        const data = ingameList.get(interaction.message.id);
        if (!data) return interaction.editReply("❌ Aktif değil.");
        if (!data.users.includes(interaction.user.id)) return interaction.editReply("⚠️ Listede değilsin.");
        data.users = data.users.filter(u => u !== interaction.user.id);
        if (data.closed && data.users.length < data.limit && data.endsAt && data.endsAt > Date.now()) data.closed = false;
        await refreshIngame(guild, interaction.message.id);
        return interaction.editReply("🚪 Listeden ayrıldın.");
      }
      if (id === "ingame_info") {
        const data = ingameList.get(interaction.message.id);
        if (!data) return interaction.reply({ content: "❌ Aktif değil.", flags: 64 });
        const rem = data.endsAt ? data.endsAt - Date.now() : null;
        return interaction.reply({ embeds: [createEmbed(guild, { title: line(EMOJI.info, "ɪɴɢᴀᴍᴇ ʙɪʟɢɪ"), description: `${EMOJI.star} ・ **${data.title}**\n${EMOJI.right} ・ Kadro: **${data.users.length}/${data.limit}**\n${EMOJI.warn} ・ Durum: **${data.closed ? "Kapalı" : "Açık"}**\n${EMOJI.settings} ・ Süre: **${data.closed ? "Kapandı" : (rem !== null ? formatRemaining(rem) : "Belirsiz")}**` })], flags: 64 });
      }
      if (id === "ingame_cancel") {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        if (!isStaff(interaction.user.id) && !isAdmin) return interaction.reply({ content: "❌ Yetkin yok.", flags: 64 });
        await interaction.deferReply({ flags: 64 });
        const data = ingameList.get(interaction.message.id);
        if (!data) return interaction.editReply("❌ Aktif değil.");
        await closeIngame(guild, interaction.message.id, `İptal: <@${interaction.user.id}>`);
        return interaction.editReply("🔴 Panel iptal edildi.");
      }

      if (id.startsWith("etkinlik_join_")) {
        await interaction.deferReply({ flags: 64 });
        const msgId = id.replace("etkinlik_join_", "");
        const data = etkinlikList.get(msgId);
        if (!data) return interaction.editReply("❌ Aktif değil.");
        if (data.closed) return interaction.editReply("🔒 Kapandı.");
        if (data.users.includes(interaction.user.id)) return interaction.editReply("⚠️ Zaten katıldın.");
        data.users.push(interaction.user.id); touchIngameJoin(interaction.user.id);
        const list = data.users.map((u, i) => `**${i + 1}.** <@${u}>`).join("\n");
        const embed = createEmbed(guild, { title: line(EMOJI.star, data.title), description: `👥 **Katılanlar (${data.users.length}/${data.limit})**\n${list}` });
        const ch = interaction.channel;
        const msg = await ch.messages.fetch(msgId).catch(() => null);
        if (data.users.length >= data.limit) {
          data.closed = true;
          const cl = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("closed").setLabel("KAPALI").setDisabled(true).setStyle(ButtonStyle.Secondary).setEmoji("🔒"));
          if (msg) await msg.edit({ embeds: [embed], components: [cl] }).catch(() => {});
          await ch.send({ embeds: [createEmbed(guild, { title: line(EMOJI.lock, "ᴀʟɪᴍʟᴀʀ ᴋᴀᴘᴀɴᴅɪ"), description: `**${data.title}** dolmuştur.` })] }).catch(() => {});
          return interaction.editReply("✅ Son adam alındı!");
        }
        if (msg) await msg.edit({ embeds: [embed] }).catch(() => {});
        return interaction.editReply("✅ Katıldın!");
      }
      return;
    }

    // ===== SLASH COMMANDS =====
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    if (maintenanceMode && !["ping", "test", "yardim"].includes(commandName) && !isOwner(interaction.user.id)) {
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ʙᴀᴋɪᴍ ᴍᴏᴅᴜ"), description: "Bot şu an bakımda." }), true);
    }

    if (commandName === "guard") {
      if (!isOwner(interaction.user.id)) return noPerm(interaction);
      const sub = interaction.options.getSubcommand();
      if (sub === "panel") return replyE(interaction, guardPanelEmbed(guild));
      if (sub === "limit") {
        const sistem = interaction.options.getString("sistem"), miktar = interaction.options.getInteger("miktar");
        guardConfig.limits[sistem] = miktar; saveGuard();
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ʟɪᴍɪᴛ ɢᴜ̈ɴᴄᴇʟʟᴇɴᴅɪ"), description: `${EMOJI.info} ・ **${sistem.toUpperCase()}** → **${miktar}**` }));
      }
      if (sub === "sistem") {
        const sistem = interaction.options.getString("sistem"), durum = interaction.options.getBoolean("durum");
        guardConfig.systems[sistem] = durum; saveGuard();
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ꜱɪꜱᴛᴇᴍ ɢᴜ̈ɴᴄᴇʟʟᴇɴᴅɪ"), description: `${EMOJI.info} ・ **${sistem.toUpperCase()}** ${durum ? "açıldı" : "kapatıldı"}` }));
      }
      if (sub === "whitelist") {
        const islem = interaction.options.getString("islem"), u = interaction.options.getUser("kullanici");
        if (islem === "liste") {
          const lst = whitelist.size ? Array.from(whitelist).map((id, i) => `**${i + 1}.** <@${id}>`).join("\n") : "Boş.";
          return replyE(interaction, createEmbed(guild, { title: line(EMOJI.shield, `ᴡʜɪᴛᴇʟɪꜱᴛ (${whitelist.size})`), description: lst }));
        }
        if (!u) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.info, "ᴋᴜʟʟᴀɴɪᴍ"), description: "`/guard whitelist islem:ekle kullanici:@kişi`" }), true);
        if (islem === "ekle") { whitelist.add(u.id); saveWhitelist(); return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴡʜɪᴛᴇʟɪꜱᴛ"), description: `${EMOJI.success} ・ ${u} muaf tutuldu.` })); }
        if (islem === "kaldir") { whitelist.delete(u.id); saveWhitelist(); return replyE(interaction, createEmbed(guild, { title: line(EMOJI.trash, "ᴡʜɪᴛᴇʟɪꜱᴛ"), description: `${EMOJI.warn} ・ ${u} listeden çıkarıldı.` })); }
      }
      return;
    }

    if (commandName === "setup") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      await interaction.deferReply();
      const cat = await guild.channels.create({ name: "•・ᴍᴏᴅᴇʀᴀꜱʏᴏɴ ʟᴏɢs", type: ChannelType.GuildCategory });
      const logChs = [
        { name: "•・ʙᴀɴ ʟᴏɢ", key: "banLog" }, { name: "•・ᴋɪᴄᴋ ʟᴏɢ", key: "kickLog" },
        { name: "•・ᴍᴇꜱᴀᴊ ʟᴏɢ", key: "msgLog" }, { name: "•・ʀᴏʟ ʟᴏɢ", key: "roleLog" },
        { name: "•・ᴋᴀɴᴀʟ ʟᴏɢ", key: "channelLog" }, { name: "•・ᴛɪᴄᴋᴇᴛ ʟᴏɢ", key: "ticketLog" },
        { name: "•・ꜱᴇꜱ ʟᴏɢ", key: "voiceLog" }, { name: "•・ʙᴏᴛ ʟᴏɢ", key: "botLog" }
      ];
      if (!config.logs) config.logs = {};
      for (const l of logChs) { const ch = await guild.channels.create({ name: l.name, type: ChannelType.GuildText, parent: cat.id }); config.logs[l.key] = ch.id; }
      saveConfig();
      return interaction.editReply({ embeds: [createEmbed(guild, { title: line(EMOJI.success, "ꜱᴇᴛᴜᴘ ᴛᴀᴍᴀᴍ"), description: `${EMOJI.settings} ・ **${logChs.length}** log kanalı kuruldu.` })] });
    }

    if (commandName === "logkur") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const ch = interaction.options.getChannel("kanal");
      config.logChannelId = ch.id; saveConfig();
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ʟᴏɢ ᴀʏᴀʀʟᴀɴᴅɪ"), description: `${EMOJI.info} ・ ${ch}` }));
    }

    if (commandName === "ticketkategori") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const ch = interaction.options.getChannel("kategori");
      config.ticketCategoryId = ch.id; saveConfig();
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴋᴀᴛᴇɢᴏʀɪ ᴀʏᴀʀʟᴀɴᴅɪ"), description: `${EMOJI.info} ・ ${ch} \`(${ch.id})\`` }));
    }

    if (commandName === "basvurupanel") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      if (!config.ticketCategoryId) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ᴋᴀᴛᴇɢᴏʀɪ ʏᴏᴋ"), description: "Önce `/ticketkategori` kullan." }), true);
      const staffRole = interaction.options.getRole("yetkili_rol");
      config.ticketStaffRoleId = staffRole.id; saveConfig();
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket_open").setStyle(ButtonStyle.Primary).setLabel("Başvuru Yap").setEmoji("📝"));
      await interaction.channel.send({ embeds: [createEmbed(guild, { description: `${EMOJI.right} ・ Formu doldurduktan sonra bekleyiniz, en kısa sürede ilgilenilecektir.`, image: TICKET_BANNER_URL })], components: [row] }).catch(() => {});
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴘᴀɴᴇʟ ɢᴏ̈ɴᴅᴇʀɪʟᴅɪ"), description: "Başvuru paneli kuruldu." }), true);
    }

    if (commandName === "ticketsonuckur") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const ch = interaction.options.getChannel("kanal");
      config.ticketSonucChannelId = ch.id; saveConfig();
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ꜱᴏɴᴜç ᴋᴀɴᴀʟɪ"), description: `${EMOJI.success} ・ Kabul/red bildirimleri ${ch} kanalına gidecek.` }));
    }

    if (commandName === "ekiprolkur") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const rol = interaction.options.getRole("rol");
      config.ekipRoleId = rol.id; saveConfig();
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴇᴋɪᴘ ʀᴏʟᴜ̈"), description: `${EMOJI.success} ・ ${rol} → kabul edilince VERİLECEK` }));
    }

    if (commandName === "alincakrolkur") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const rol = interaction.options.getRole("rol");
      config.alincakRoleId = rol.id; saveConfig();
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴀʟɪɴᴀᴄᴀᴋ ʀᴏʟ"), description: `${EMOJI.success} ・ ${rol} → kabul edilince ALINACAK` }));
    }

    if (commandName === "yetkili") {
      if (!isOwner(interaction.user.id)) return noPerm(interaction);
      const sub = interaction.options.getSubcommand();
      if (sub === "liste") {
        const lst = staffIds.size ? Array.from(staffIds).map((id, i) => `**${i + 1}.** <@${id}>`).join("\n") : "Boş.";
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.crown, `ʏᴇᴛᴋɪʟɪʟᴇʀ (${staffIds.size})`), description: lst }));
      }
      const u = interaction.options.getUser("kullanici");
      if (isOwner(u.id)) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.info, "ʙɪʟɢɪ"), description: `${u} zaten owner.` }), true);
      if (sub === "ekle") { staffIds.add(u.id); saveStaff(); return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ʏᴇᴛᴋɪʟɪ ᴇᴋʟᴇɴᴅɪ"), description: `${EMOJI.success} ・ ${u} yetkili oldu.` })); }
      if (sub === "kaldir") { staffIds.delete(u.id); saveStaff(); return replyE(interaction, createEmbed(guild, { title: line(EMOJI.trash, "ʏᴇᴛᴋɪʟɪ ᴋᴀʟᴅɪʀɪʟᴅɪ"), description: `${EMOJI.warn} ・ ${u} listeden çıkarıldı.` })); }
    }

    if (commandName === "otyetki") {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !isOwner(interaction.user.id)) return noPerm(interaction);
      const sub = interaction.options.getSubcommand();
      if (sub === "liste") {
        const lst = otYetkililer.length ? otYetkililer.map((id, i) => `**${i + 1}.** <@${id}>`).join("\n") : "Boş.";
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.crown, "ᴏᴛ ʏᴇᴛᴋɪʟɪʟᴇʀ"), description: lst }));
      }
      const u = interaction.options.getUser("kullanici");
      if (sub === "ekle") { if (!otYetkililer.includes(u.id)) otYetkililer.push(u.id); saveAuth(); return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴏᴛ ʏᴇᴛᴋɪ ᴇᴋʟᴇɴᴅɪ"), description: `${u} artık OT kullanabilir.` })); }
      if (sub === "kaldir") { otYetkililer = otYetkililer.filter(x => x !== u.id); saveAuth(); return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴏᴛ ʏᴇᴛᴋɪ ᴋᴀʟᴅɪʀɪʟᴅɪ"), description: `${u} artık OT kullanamaz.` })); }
    }

    if (commandName === "ot") {
      if (!isOtYetkili(interaction.user.id) && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !isOwner(interaction.user.id)) return noPerm(interaction);
      const u = interaction.options.getUser("kullanici"), amount = interaction.options.getInteger("miktar");
      ensureUser(u.id); envanter[u.id].ot = Math.max(0, envanter[u.id].ot + amount); saveEnvanter();
      const emb = createEmbed(guild, { title: line(EMOJI.weed, "ᴏᴛ ɢᴜ̈ɴᴄᴇʟʟᴇɴᴅɪ"), description: `${line(EMOJI.info, `${u}`)}\n${line(EMOJI.right, `İşlem: ${amount > 0 ? "+" : ""}${formatNumber(amount)} OT`)}\n${line(EMOJI.box, `Toplam: ${formatNumber(envanter[u.id].ot)} OT`)}` });
      await sendOtLog(guild, emb); return replyE(interaction, emb);
    }

    if (commandName === "envanter") {
      ensureUser(interaction.user.id);
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.box, "ᴇɴᴠᴀɴᴛᴇʀ"), description: `${EMOJI.weed} ・ **${formatNumber(envanter[interaction.user.id].ot)} OT**` }));
    }

    if (commandName === "top10ot") {
      const arr = Object.entries(envanter).map(([id, d]) => ({ id, ot: d?.ot || 0 })).sort((a, b) => b.ot - a.ot).slice(0, 10);
      const lst = arr.length ? arr.map((x, i) => `${EMOJI.right} ・ **${i + 1}.** <@${x.id}> → **${formatNumber(x.ot)} OT**`).join("\n") : "Veri yok.";
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.crown, "ᴛᴏᴘ 10 ᴏᴛ"), description: lst }));
    }

    if (commandName === "otreset") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const u = interaction.options.getUser("kullanici"); ensureUser(u.id); envanter[u.id].ot = 0; saveEnvanter();
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.refresh, "ᴏᴛ ꜱɪꜰɪʀʟᴀɴᴅɪ"), description: `${EMOJI.success} ・ ${u} OT sıfırlandı.` }));
    }

    if (commandName === "otlogkur") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const ch = interaction.options.getChannel("kanal"); otLogChannelId = ch.id; saveJSON(FILES.otlog, otLogChannelId);
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴏᴛ ʟᴏɢ ᴀʏᴀʀʟᴀɴᴅɪ"), description: `${EMOJI.info} ・ ${ch}` }));
    }

    if (commandName === "aktiflik") {
      const sub = interaction.options.getSubcommand();
      if (sub === "log") {
        if (!isOwner(interaction.user.id)) return noPerm(interaction);
        const ch = interaction.options.getChannel("kanal"); config.aktiflikLogChannelId = ch.id; saveConfig();
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴋᴀʏᴅᴇᴅɪʟᴅɪ"), description: `${EMOJI.success} ・ Aktiflik log: ${ch}` }));
      }
      if (sub === "baslat") {
        if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
        const role = interaction.options.getRole("rol"), sureText = interaction.options.getString("sure");
        const dMs = parseDurationToMs(sureText);
        if (!dMs || dMs <= 0) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.info, "ᴋᴜʟʟᴀɴɪᴍ"), description: `${EMOJI.right} ・ Örnekler: \`30dk\`, \`2sa\`, \`1g 2sa\`` }), true);
        const data = { roleId: role.id, dMs, endsAt: Date.now() + dMs, joined: new Set(), closed: false, timer: null, channelId: interaction.channel.id };
        const msg = await interaction.channel.send({ content: `${role}`, embeds: [aktiflikEmbed(guild, data)], components: [aktiflikRows(false)] });
        aktiflikList.set(msg.id, data);
        data.timer = setTimeout(() => closeAktiflik(guild, msg.id, "Süre doldu").catch(() => {}), dMs);
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴀᴋᴛɪꜰʟɪᴋ ʙᴀşʟᴀᴅɪ"), description: `${EMOJI.success} ・ Test başlatıldı.` }), true);
      }
    }

    if (commandName === "banaffpanel") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("banaff_open").setLabel("Banlıyım!").setStyle(ButtonStyle.Secondary).setEmoji("📝"));
      await interaction.channel.send({ embeds: [createEmbed(guild, { title: line(EMOJI.ban, "ʙᴀɴ ᴀꜰꜰɪ"), description: `${EMOJI.right} ・ Banlı olup ban affı isteyen kişiler butona tıklayabilir.`, image: TICKET_BANNER_URL })], components: [row] }).catch(() => {});
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴘᴀɴᴇʟ ᴋᴜʀᴜʟᴅᴜ"), description: "Ban affı paneli gönderildi." }), true);
    }

    if (commandName === "banafflogkur") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const ch = interaction.options.getChannel("kanal"); config.banAffLogChannelId = ch.id; saveConfig();
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴋᴀʏᴅᴇᴅɪʟᴅɪ"), description: `${EMOJI.success} ・ Ban affı log: ${ch}` }));
    }

    if (commandName === "bansorgu") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const targetId = interaction.options.getString("kullanici_id").trim();
      const recs = banAffRecords.filter(r => r.userId === targetId);
      if (!recs.length) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.search, "ʙᴀɴ ꜱᴏʀɢᴜ"), description: `${EMOJI.warn} ・ \`${targetId}\` için ban affı talebi bulunamadı.` }), true);
      const desc = recs.map((r, i) => `**${i + 1}. Talep** (${new Date(r.createdAt).toLocaleDateString("tr-TR")})\n\`\`\`${r.reason}\`\`\``).join("\n");
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.search, "ʙᴀɴ ꜱᴏʀɢᴜ"), description: `<@${targetId}> — **${recs.length}** talep:\n\n${desc}` }));
    }

    if (commandName === "banaffisil") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const targetId = interaction.options.getString("kullanici_id").trim();
      const before = banAffRecords.length; banAffRecords = banAffRecords.filter(r => r.userId !== targetId); saveBanAff();
      const del = before - banAffRecords.length;
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.trash, "ʙᴀɴ ᴀꜰꜰɪ ꜱɪʟɪɴᴅɪ"), description: del > 0 ? `${EMOJI.success} ・ <@${targetId}> — **${del}** talep silindi.` : `${EMOJI.warn} ・ Kayıt bulunamadı.` }));
    }

    if (commandName === "banaffsifirla") {
      if (!isOwner(interaction.user.id)) return noPerm(interaction);
      const count = banAffRecords.length; banAffRecords = []; saveBanAff();
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.refresh, "ᴛᴜ̈ᴍ ʙᴀɴ ᴀꜰꜰʟᴀʀɪ ꜱɪꜰɪʀʟᴀɴᴅɪ"), description: `${EMOJI.success} ・ **${count}** kayıt silindi.` }));
    }

    if (commandName === "banlist") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      return interaction.reply({ embeds: [banListEmbed(guild, 1)], components: [banListRows(1)] });
    }

    if (commandName === "sil") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return noPerm(interaction);
      const amount = interaction.options.getInteger("miktar");
      const msgs = await interaction.channel.bulkDelete(amount, true).catch(() => null);
      if (!msgs) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ʜᴀᴛᴀ"), description: "14 günden eski mesajlar silinemez." }), true);
      pushLog("mod", "Toplu Mesaj Silindi", `${msgs.size} mesaj | #${interaction.channel.name}`);
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴛᴇᴍɪᴢʟᴇɴᴅɪ"), description: `${EMOJI.trash} ・ ${msgs.size} mesaj silindi.` }), true);
    }

    if (commandName === "kick") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id) && !interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return noPerm(interaction);
      const u = interaction.options.getUser("kullanici"), sebep = interaction.options.getString("sebep") || "Sebep belirtilmedi";
      const member = await guild.members.fetch(u.id).catch(() => null);
      if (!member) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ʙᴜʟᴜɴᴀᴍᴀᴅɪ"), description: "Kullanıcı bulunamadı." }), true);
      if (!member.kickable) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.lock, "ᴀᴛɪʟᴀᴍᴀᴢ"), description: "Rol hiyerarşisi engel." }), true);
      await member.kick(sebep).catch(() => {});
      pushLog("kick", "Üye Atıldı", `${u.tag} | Sebep: ${sebep}`);
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.kick, "ᴜ̈ʏᴇ ᴀᴛɪʟᴅɪ"), description: `${EMOJI.info} ・ ${u}\n${EMOJI.right} ・ Sebep: **${sebep}**` }));
    }

    if (commandName === "ban") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id) && !interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return noPerm(interaction);
      const u = interaction.options.getUser("kullanici"), sebep = interaction.options.getString("sebep") || "Sebep belirtilmedi";
      const member = await guild.members.fetch(u.id).catch(() => null);
      if (member && !member.bannable) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.lock, "ʙᴀɴʟᴀɴᴀᴍᴀᴢ"), description: "Rol hiyerarşisi engel." }), true);
      await guild.members.ban(u.id, { reason: sebep }).catch(() => {});
      pushLog("ban", "Üye Banlandı", `${u.tag} | Sebep: ${sebep}`);
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.ban, "ᴜ̈ʏᴇ ʙᴀɴʟᴀɴᴅɪ"), description: `${EMOJI.info} ・ ${u}\n${EMOJI.right} ・ Sebep: **${sebep}**` }));
    }

    if (commandName === "nuke") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return noPerm(interaction);
      await interaction.deferReply();
      const old = interaction.channel;
      const newCh = await old.clone({ reason: `Nuke: ${interaction.user.tag}` }).catch(() => null);
      if (!newCh) return interaction.editReply("❌ Klonlanamadı.");
      await newCh.setPosition(old.position).catch(() => {});
      await old.delete().catch(() => {});
      await newCh.send({ embeds: [createEmbed(guild, { title: line(EMOJI.warn, "ɴᴜᴋᴇ"), description: `${EMOJI.success} ・ Kanal <@${interaction.user.id}> tarafından temizlendi.` })] }).catch(() => {});
      return;
    }

    if (commandName === "dm") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const role = interaction.options.getRole("rol"), text = interaction.options.getString("mesaj");
      await interaction.deferReply({ flags: 64 });
      let sent = 0, fail = 0;
      for (const member of role.members.values()) {
        await new Promise(r => setTimeout(r, 1200));
        try { await member.send(text); sent++; } catch { fail++; }
      }
      return interaction.editReply({ embeds: [createEmbed(guild, { title: line(EMOJI.success, "ᴅᴍ ɢᴏ̈ɴᴅᴇʀɪʟᴅɪ"), description: `${line(EMOJI.info, `Başarılı: ${sent}`)}\n${line(EMOJI.warn, `Başarısız: ${fail}`)}` })] });
    }

    if (commandName === "sesgir") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const vc = interaction.member.voice.channel;
      if (!vc) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ꜱᴇꜱ ᴋᴀɴᴀʟɪ ʏᴏᴋ"), description: "Ses kanalında değilsin." }), true);
      try { joinVoiceChannel({ channelId: vc.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false }); }
      catch (e) { return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ʜᴀᴛᴀ"), description: e.message }), true); }
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ꜱᴇꜱᴇ ɢɪʀɪʟᴅɪ"), description: `${EMOJI.info} ・ ${vc}` }));
    }

    if (commandName === "sescik") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const conn = getVoiceConnection(guild.id);
      if (!conn) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ʜᴀᴛᴀ"), description: "Seste değilim." }), true);
      conn.destroy();
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ꜱᴇꜱᴛᴇɴ ᴄɪᴋɪʟᴅɪ"), description: "Ses kanalından çıkıldı." }));
    }

    if (commandName === "allvmute") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const vc = interaction.member.voice.channel;
      if (!vc) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ꜱᴇꜱ ᴋᴀɴᴀʟɪ ʏᴏᴋ"), description: "Ses kanalında değilsin." }), true);
      await interaction.deferReply({ flags: 64 });
      let count = 0;
      for (const [, m] of vc.members) { if (m.user.bot) continue; await m.voice.setMute(true).then(() => count++).catch(() => {}); }
      return interaction.editReply({ embeds: [createEmbed(guild, { title: line(EMOJI.muted, "ʜᴇʀᴋᴇꜱ ᴍᴜᴛᴇ"), description: `${EMOJI.success} ・ **${count}** kişi mute edildi.` })] });
    }

    if (commandName === "unvmuteall") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const vc = interaction.member.voice.channel;
      if (!vc) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ꜱᴇꜱ ᴋᴀɴᴀʟɪ ʏᴏᴋ"), description: "Ses kanalında değilsin." }), true);
      await interaction.deferReply({ flags: 64 });
      let count = 0;
      for (const [, m] of vc.members) { if (m.user.bot) continue; await m.voice.setMute(false).then(() => count++).catch(() => {}); }
      return interaction.editReply({ embeds: [createEmbed(guild, { title: line(EMOJI.unmute, "ʜᴇʀᴋᴇꜱ ᴜɴᴍᴜᴛᴇ"), description: `${EMOJI.success} ・ **${count}** kişi unmute edildi.` })] });
    }

    if (commandName === "tasi") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const hedef = interaction.options.getChannel("kanal"), src = interaction.member.voice.channel;
      if (!src) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ꜱᴇꜱ ᴋᴀɴᴀʟɪ ʏᴏᴋ"), description: "Ses kanalında değilsin." }), true);
      await interaction.deferReply({ flags: 64 });
      let count = 0;
      for (const [, m] of src.members) { if (m.user.bot) continue; await m.voice.setChannel(hedef).then(() => count++).catch(() => {}); }
      return interaction.editReply({ embeds: [createEmbed(guild, { title: line(EMOJI.move, "ᴛᴀşɪɴᴅɪ"), description: `${EMOJI.success} ・ **${count}** kişi ${hedef} kanalına taşındı.` })] });
    }

    if (commandName === "sesyasak") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const sub = interaction.options.getSubcommand();
      if (sub === "liste") {
        const lst = voiceBlockedUsers.size ? Array.from(voiceBlockedUsers).map((id, i) => `**${i + 1}.** <@${id}>`).join("\n") : "Boş.";
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.muted, "ꜱᴇꜱ ʏᴀꜱᴀᴋ ʟɪꜱᴛᴇꜱɪ"), description: lst }));
      }
      const u = interaction.options.getUser("kullanici");
      if (sub === "ekle") {
        voiceBlockedUsers.add(u.id);
        const m = await guild.members.fetch(u.id).catch(() => null);
        if (m?.voice?.channel) await m.voice.disconnect().catch(() => {});
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.muted, "ꜱᴇꜱ ʏᴀꜱᴀᴋ"), description: `${EMOJI.success} ・ ${u} ses yasağına alındı.` }));
      }
      if (sub === "kaldir") { voiceBlockedUsers.delete(u.id); return replyE(interaction, createEmbed(guild, { title: line(EMOJI.unmute, "ꜱᴇꜱ ʏᴀꜱᴀᴋ ᴋᴀʟᴅɪʀɪʟᴅɪ"), description: `${EMOJI.warn} ・ ${u} yasağı kaldırıldı.` })); }
    }

    if (commandName === "etkinlik") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const baslik = interaction.options.getString("baslik"), limit = interaction.options.getInteger("limit");
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("temp").setLabel("Katıldım").setStyle(ButtonStyle.Success).setEmoji("✅"));
      const msg = await interaction.channel.send({ embeds: [createEmbed(guild, { title: line(EMOJI.star, baslik), description: `👥 **Katılanlar (0/${limit})**` })], components: [row] });
      row.components[0].setCustomId(`etkinlik_join_${msg.id}`);
      await msg.edit({ components: [row] });
      etkinlikList.set(msg.id, { users: [], limit, title: baslik, closed: false });
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴇᴛᴋɪɴʟɪᴋ ᴋᴜʀᴜʟᴅᴜ"), description: `${line(EMOJI.star, `**${baslik}**`)}\n${line(EMOJI.right, `Kontenjan: **${limit}**`)}` }), true);
    }

    if (commandName === "ingame") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const sub = interaction.options.getSubcommand();
      if (sub === "olustur") {
        const baslik = interaction.options.getString("baslik"), limit = interaction.options.getInteger("limit"), sureText = interaction.options.getString("sure");
        const dMs = parseDurationToMs(sureText);
        const data = { title: baslik, limit, users: [], endsAt: dMs ? Date.now() + dMs : null, closed: false, timer: null, channelId: interaction.channel.id, ownerId: interaction.user.id };
        await interaction.reply({ embeds: [ingameEmbed(guild, data)], components: [ingameRows(false)] });
        const msg = await interaction.fetchReply();
        ingameList.set(msg.id, data);
        if (dMs) data.timer = setTimeout(() => closeIngame(guild, msg.id, "Süre doldu"), dMs);
        return;
      }
      if (sub === "iptal") {
        const entry = Array.from(ingameList.entries()).find(([, d]) => d.channelId === interaction.channel.id && !d.closed);
        if (!entry) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ʙᴜʟᴜɴᴀᴍᴀᴅɪ"), description: "Bu kanalda aktif kadro paneli yok." }), true);
        await closeIngame(guild, entry[0], `İptal: ${interaction.user.tag}`);
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴘᴀɴᴇʟ ɪᴘᴛᴀʟ"), description: "Kadro paneli iptal edildi." }), true);
      }
    }

    if (commandName === "id") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const pid = interaction.options.getInteger("oyuncu_id");
      try {
        const data = await getPlayer(pid);
        if (!data.found) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ʙᴜʟᴜɴᴀᴍᴀᴅɪ"), description: "Oyuncu bulunamadı." }), true);
        pushLog("fivem", "ID Sorgu", `ID: ${pid} → ${data.name}`);
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.fivem, "ꜰɪᴠᴇᴍ ᴏʏᴜɴᴄᴜ"), fields: [{ name: "İsim", value: `\`${data.name}\`` }, { name: "ID", value: `\`${data.id}\``, inline: true }, { name: "Ping", value: `\`${data.ping}\``, inline: true }, { name: "Steam", value: `\`${data.steam}\`` }, { name: "Discord", value: `\`${data.discord}\`` }] }));
      } catch (e) { return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ᴀᴘɪ ʜᴀᴛᴀ"), description: e.message }), true); }
    }

    if (commandName === "tag") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const search = interaction.options.getString("arama").trim();
      try {
        const json = await getPlayers(), players = json?.Data?.players || [];
        const matched = players.filter(p => cleanFiveMName(p.name).includes(search.toLowerCase()));
        if (!matched.length) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ʙᴜʟᴜɴᴀᴍᴀᴅɪ"), description: "Oyuncu bulunamadı." }), true);
        const lst = matched.slice(0, 25).map(p => `${EMOJI.right} ・ **${p.name}** (ID: \`${p.id}\` | Ping: \`${p.ping}\`)`).join("\n");
        pushLog("fivem", "Tag Sorgu", `"${search}" → ${matched.length} sonuç`);
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.search, "ᴛᴀɢ ᴀʀᴀᴍᴀ"), description: `${EMOJI.success} ・ Toplam: **${matched.length}**\n\n${lst}` }));
      } catch (e) { return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ᴀᴘɪ ʜᴀᴛᴀ"), description: e.message }), true); }
    }

    if (commandName === "ping") {
      const ws = client.ws.ping, start = Date.now();
      await interaction.deferReply();
      return interaction.editReply({ embeds: [createEmbed(guild, { title: line(EMOJI.settings, "ᴘɪɴɢ"), description: `${EMOJI.success} ・ Mesaj: **${Date.now() - start}ms**\n${EMOJI.right} ・ WS: **${ws}ms**` })] });
    }

    if (commandName === "test") return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴛᴇꜱᴛ"), description: `${EMOJI.right} ・ Bot aktif ✅` }));

    if (commandName === "bakim") {
      if (!isOwner(interaction.user.id)) return noPerm(interaction);
      maintenanceMode = !maintenanceMode;
      pushLog("mod", "Bakım Modu", maintenanceMode ? "AÇıldı" : "Kapatıldı");
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.settings, "ʙᴀᴋɪᴍ ᴍᴏᴅᴜ"), description: maintenanceMode ? line(EMOJI.warn, "Açıldı") : line(EMOJI.success, "Kapatıldı") }));
    }

    if (commandName === "patlat") {
      await interaction.reply({ content: "💣 **3**" });
      await new Promise(r => setTimeout(r, 1000)); await interaction.editReply("💣 **2**");
      await new Promise(r => setTimeout(r, 1000)); await interaction.editReply("💣 **1**");
      await new Promise(r => setTimeout(r, 1000)); await interaction.editReply("🤣 **şaka la yarram** 🤣");
      return;
    }

    if (commandName === "urlkoruma") {
      if (!isOwner(interaction.user.id)) return noPerm(interaction);
      urlProtection.enabled = !urlProtection.enabled;
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.shield, "ᴜʀʟ ᴋᴏʀᴜᴍᴀ"), description: urlProtection.enabled ? `${EMOJI.success} ・ **AÇILDI**` : `${EMOJI.warn} ・ **KAPATILDI**` }));
    }

    if (commandName === "yardim") {
      return replyE(interaction, createEmbed(guild, {
        title: line(EMOJI.star, "ᴋᴏᴍᴜᴛ ʟɪꜱᴛᴇꜱɪ"),
        description:
          `**${line(EMOJI.shield, "ɢᴜᴀʀᴅ")}** \`/guard panel|limit|sistem|whitelist\`\n` +
          `**${line(EMOJI.settings, "ᴋᴜʀᴜʟᴜᴍ")}** \`/setup /logkur /ticketkategori /basvurupanel /ticketsonuckur /ekiprolkur /alincakrolkur\`\n` +
          `**${line(EMOJI.crown, "ʏᴇᴛᴋɪ")}** \`/yetkili ekle|kaldir|liste\`\n` +
          `**${line(EMOJI.weed, "ᴏᴛ")}** \`/ot /envanter /top10ot /otreset /otyetki /otlogkur\`\n` +
          `**${line(EMOJI.fivem, "ꜰɪᴠᴇᴍ")}** \`/id /tag\`\n` +
          `**${line(EMOJI.star, "ᴇᴛᴋɪɴʟɪᴋ")}** \`/etkinlik /ingame olustur|iptal\`\n` +
          `**${line(EMOJI.star, "ᴀᴋᴛɪꜰʟɪᴋ")}** \`/aktiflik baslat|log\`\n` +
          `**${line(EMOJI.ban, "ʙᴀɴ ᴀꜰꜰɪ")}** \`/banaffpanel /banafflogkur /bansorgu /banaffisil /banaffsifirla /banlist\`\n` +
          `**${line(EMOJI.ban, "ᴍᴏᴅ")}** \`/sil /kick /ban /nuke /dm\`\n` +
          `**${line(EMOJI.headphones, "ꜱᴇꜱ")}** \`/sesgir /sescik /allvmute /unvmuteall /tasi /sesyasak\`\n` +
          `**${line(EMOJI.settings, "ᴅɪğᴇʀ")}** \`/ping /test /bakim /patlat /urlkoruma\``
      }));
    }

  } catch (err) { console.error("interactionCreate error:", err); }
});

// ===================== EVENT HANDLERS =====================
async function fetchExecutor(guild, type) {
  try { return (await guild.fetchAuditLogs({ limit: 1, type })).entries.first() || null; }
  catch { return null; }
}

client.on("guildBanAdd", async (ban) => {
  try {
    const logCh = ban.guild.channels.cache.get(config.logs?.banLog);
    if (logCh) logCh.send({ embeds: [createEmbed(ban.guild, { title: line(EMOJI.ban, "ʙᴀɴ ʟᴏɢ"), description: `${EMOJI.info} ・ ${ban.user}\n${EMOJI.right} ・ ID: ${ban.user.id}` })] }).catch(() => {});
    pushLog("ban", "Ban Logu", `${ban.user.tag} (${ban.user.id})`);
    if (!isGuardEnabled("ban")) return;
    const entry = await fetchExecutor(ban.guild, 22);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(ban.user.id)) return;
    await guardHit(ban.guild, entry.executor.id, "ban", `Üye banlandı: ${ban.user.tag}`);
  } catch {}
});

client.on("guildMemberRemove", async (member) => {
  try {
    const logs = await member.guild.fetchAuditLogs({ limit: 1, type: 20 }).catch(() => null);
    const entry = logs?.entries?.first();
    if (entry?.action === 20) {
      const logCh = member.guild.channels.cache.get(config.logs?.kickLog);
      if (logCh) logCh.send({ embeds: [createEmbed(member.guild, { title: line(EMOJI.kick, "ᴋɪᴄᴋ ʟᴏɢ"), description: `${EMOJI.info} ・ ${member.user}\n${EMOJI.right} ・ Yetkili: ${entry.executor}` })] }).catch(() => {});
      pushLog("kick", "Kick Logu", `${member.user.tag} | Yetkili: ${entry.executor?.tag}`);
    }
    if (!isGuardEnabled("kick") || !entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(member.id)) return;
    await guardHit(member.guild, entry.executor.id, "kick", `Kick: ${member.user.tag}`);
  } catch {}
});

client.on("channelDelete", async (channel) => {
  try {
    if (!channel.guild) return;
    const logCh = channel.guild.channels.cache.get(config.logs?.channelLog);
    if (logCh) logCh.send({ embeds: [createEmbed(channel.guild, { title: line(EMOJI.warn, "ᴋᴀɴᴀʟ ꜱɪʟɪɴᴅɪ"), description: `${EMOJI.info} ・ ${channel.name}\n${EMOJI.right} ・ ID: ${channel.id}` })] }).catch(() => {});
    pushLog("channel", "Kanal Silindi", `#${channel.name} (${channel.id})`);
    if (!isGuardEnabled("channel")) return;
    const entry = await fetchExecutor(channel.guild, 12);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(channel.id)) return;
    await guardHit(channel.guild, entry.executor.id, "channel", `Kanal silindi: #${channel.name}`);
  } catch {}
});

client.on("roleDelete", async (role) => {
  try {
    if (!role.guild) return;
    const logCh = role.guild.channels.cache.get(config.logs?.roleLog);
    if (logCh) logCh.send({ embeds: [createEmbed(role.guild, { title: line(EMOJI.crown, "ʀᴏʟ ꜱɪʟɪɴᴅɪ"), description: `${EMOJI.info} ・ ${role.name}` })] }).catch(() => {});
    pushLog("role", "Rol Silindi", role.name);
    if (!isGuardEnabled("role")) return;
    const entry = await fetchExecutor(role.guild, 32);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(role.id)) return;
    await guardHit(role.guild, entry.executor.id, "role", `Rol silindi: ${role.name}`);
  } catch {}
});

client.on("messageDelete", async (msg) => {
  try {
    if (!msg.guild || msg.author?.bot) return;
    const logCh = msg.guild.channels.cache.get(config.logs?.msgLog);
    if (!logCh) return;
    pushLog("message", "Mesaj Silindi", `${msg.author?.tag} | #${msg.channel?.name}`);
    logCh.send({ embeds: [createEmbed(msg.guild, { title: line(EMOJI.trash, "ᴍᴇꜱᴀᴊ ꜱɪʟɪɴᴅɪ"), description: `${EMOJI.info} ・ ${msg.author}\n${EMOJI.right} ・ ${msg.channel}\n\n💬 **Mesaj:**\n${msg.content || "Boş"}` })] }).catch(() => {});
  } catch {}
});

client.on("guildMemberUpdate", async (oldM, newM) => {
  try {
    const logCh = newM.guild.channels.cache.get(config.logs?.roleLog);
    if (!logCh) return;
    const added = newM.roles.cache.filter(r => !oldM.roles.cache.has(r.id));
    const removed = oldM.roles.cache.filter(r => !newM.roles.cache.has(r.id));
    if (!added.size && !removed.size) return;
    let text = "";
    if (added.size) text += `➕ ${added.map(r => `<@&${r.id}>`).join(", ")}\n`;
    if (removed.size) text += `➖ ${removed.map(r => `<@&${r.id}>`).join(", ")}\n`;
    pushLog("role", "Rol Değişimi", `${newM.user.tag} | +${added.size} -${removed.size}`);
    logCh.send({ embeds: [createEmbed(newM.guild, { title: line(EMOJI.crown, "ʀᴏʟ ʟᴏɢ"), description: `${EMOJI.info} ・ ${newM}\n\n${text}` })] }).catch(() => {});
  } catch {}
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const member = newState.member;
    if (!member || member.user.bot) return;
    if (!oldState.channelId && newState.channelId) touchLastVoiceJoin(member.id);
    if (voiceBlockedUsers.has(member.id) && newState.channelId) { await member.voice.disconnect().catch(() => {}); return; }
    const logCh = newState.guild.channels.cache.get(config.logs?.voiceLog);
    if (!logCh) return;
    if (!oldState.channelId && newState.channelId) {
      pushLog("voice", "Ses Girişi", `${member.user.tag} → #${newState.channel?.name}`);
      logCh.send({ embeds: [createEmbed(newState.guild, { title: line(EMOJI.headphones, "ꜱᴇꜱ ɢɪʀɪꜱ"), description: `${EMOJI.info} ・ ${member} → ${newState.channel}` })] }).catch(() => {});
    } else if (oldState.channelId && !newState.channelId) {
      pushLog("voice", "Ses Çıkışı", `${member.user.tag}`);
      logCh.send({ embeds: [createEmbed(newState.guild, { title: line(EMOJI.muted, "ꜱᴇꜱ ᴄɪᴋɪꜱ"), description: `${EMOJI.info} ・ ${member}` })] }).catch(() => {});
    }
  } catch {}
});

client.on("guildMemberAdd", (m) => {
  try {
    if (!m.user.bot) return;
    const logCh = m.guild.channels.cache.get(config.logs?.botLog);
    if (!logCh) return;
    pushLog("bot", "Bot Eklendi", m.user.tag);
    logCh.send({ embeds: [createEmbed(m.guild, { title: line(EMOJI.settings, "ʙᴏᴛ ᴇᴋʟᴇɴᴅɪ"), description: `${EMOJI.info} ・ ${m.user}` })] }).catch(() => {});
  } catch {}
});

client.on("messageCreate", (message) => { if (!message.guild || message.author.bot) return; touchLastMessage(message.author.id); });

// ===================== PRESENCE =====================
function setBotPresence() {
  if (!client.user) return;
  client.user.setPresence({ activities: [{ name: "VAZGUCXN WAS HERE", type: ActivityType.Playing }], status: "dnd" });
}
client.once(Events.ClientReady, () => { console.log(`🟢 Bot aktif: ${client.user.tag}`); setBotPresence(); setInterval(setBotPresence, 5 * 60 * 1000); });
setInterval(() => console.log("🟢 ALIVE:", new Date().toISOString()), 60_000);

// ===================== BOOTSTRAP =====================
(async () => {
  await initMongo();
  await registerCommands();
  await client.login(TOKEN);
  console.log("✅ Bot login OK");
})().catch(e => console.error("❌ Bootstrap hatası:", e));
