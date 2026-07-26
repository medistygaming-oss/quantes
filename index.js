// ===================== VAZGUÇXN • GUARD & TICKET BOT =====================
// discord.js v14 | Slash Komutlar
// Kapsam: Guard Sistemi • .setup Log Kanalları • Ticket (Başvuru) Sistemi
// ===========================================================================

process.on("unhandledRejection", (r) => console.error("UNHANDLED_REJECTION:", r));
process.on("uncaughtException", (e) => console.error("UNCAUGHT_EXCEPTION:", e));

const fs = require("fs");
const path = require("path");
const express = require("express");
const { MongoClient } = require("mongodb");
const { joinVoiceChannel, getVoiceConnection } = require("@discordjs/voice");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  ActivityType,
  SlashCommandBuilder,
  Events,
  REST,
  Routes
} = require("discord.js");

// ===================== FETCH (Node 18+ global) fallback =====================
let _fetch = global.fetch;
if (!_fetch) {
  try {
    _fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
  } catch (e) {
    console.error("❌ fetch yok! Node 18+ kullan veya node-fetch kur.");
    process.exit(1);
  }
}

// ===================== ENV =====================
const TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const CLIENT_ID = (process.env.CLIENT_ID || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN eksik! (.env / Render ENV'e ekle)");
  process.exit(1);
}

// ===================== Render Keep-Alive =====================
const app = express();
app.get("/", (req, res) => res.status(200).send("OK"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log("🌐 Web aktif:", PORT));

// ===================== AYARLAR / MARKA =====================
const OWNER_IDS = (process.env.OWNER_IDS || "827905938923978823,1129811807570247761")
  .split(",").map((x) => x.trim()).filter(Boolean);
const isOwner = (id) => OWNER_IDS.includes(id);

// Yetkili listesi kalıcıdır (data/staff.json), /yetkili komutuyla yönetilir.
// Env STAFF_IDS sadece ilk kurulumda başlangıç değeri olarak kullanılır.
const ENV_STAFF_IDS = (process.env.STAFF_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
let staffIds; // bootstrap'te doldurulur
const isStaff = (id) => isOwner(id) || (staffIds && staffIds.has(id));

// /guard komutlarını SADECE bu ID kullanabilir (diğer owner'lar dahi kullanamaz)
const GUARD_MASTER_ID = "827905938923978823";
const isGuardCommandUser = (id) => id === GUARD_MASTER_ID;

// Not: media.discordapp.net linkleri süreli imza (ex/is/hm) taşır ve zamanla expire olabilir.
// Onun yerine kalıcı cdn.discordapp.com linkini kullanıyoruz (mesaj silinmediği sürece bozulmaz).
const DEFAULT_IMAGE_URL = "https://cdn.discordapp.com/attachments/1525920078720143551/1525933790554231027/content.png";

const BOT_IMAGE_URL = (process.env.BOT_IMAGE_URL || "").trim() || DEFAULT_IMAGE_URL;
const TICKET_BANNER_URL = (process.env.TICKET_BANNER_URL || "").trim() || BOT_IMAGE_URL;
const PANEL_AUTHOR = (process.env.PANEL_AUTHOR || "Vazgucxn Assistant").trim();
const FOOTER_TEXT = (process.env.FOOTER_TEXT || "Developed by Vazgucxn").trim();
const CFX_CODE = (process.env.CFX_CODE || "xjx5kr").trim();

const NAVY = 0x0b1a3a;

// ===================== EMOJİLER (senin özel setin) =====================
const EMOJI = {
  settings: "<a:settings:1525963621975462032>",
  success: "<a:success:1525963728309190680>",
  info: "<:info:1525963915564159046>",
  lock: "<a:lock:1525964141695598612>",
  right: "<a:right:1525964486115201166>",
  warn: "<:warn:1525965027545452544>",
  ban: "<:ban:1525965485424902276>",
  kick: "<:ban:1525965485424902276>",
  trash: "<:trash:1525965599627546684>",
  shield: "<:shield:1525966402312343702>",
  crown: "<a:crown:1525965818037276853>",
  star: "<:yildiz:1520167832678301890>",
  weed: "<:weed:1520169653358428351>",
  box: "<:box:1520169843452543169>",
  refresh: "<:refresh:1520170092975882260>",
  headphones: "<:headphones:1520170199368601710>",
  muted: "<:muted:1520170268524281866>",
  unmute: "<:unmute:1520170332659646564>",
  move: "<a:sagok:1520167724355948744>",
  search: "<:search:1520171230009753770>",
  fivem: "<:fivem:1520171196518240546>"
};
const line = (emoji, text) => `${emoji} ・ ${text}`;

// ===================== MONGODB (kalıcı veri, opsiyonel) =====================
const MONGODB_URI = (process.env.MONGODB_URI || process.env.MONGODB_URL || "").trim();
const MONGODB_DB = (process.env.MONGODB_DB || "vazguxn_bot").trim();

let mongoCol = null;
let mongoReady = false;

async function initMongo() {
  if (!MONGODB_URI) {
    console.log("ℹ️ MONGODB_URI tanımlı değil, sadece yerel JSON kullanılacak.");
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    mongoCol = client.db(MONGODB_DB).collection("kv_store");
    mongoReady = true;
    console.log("✅ MongoDB bağlantısı OK — veriler kalıcı olacak.");
  } catch (e) {
    console.error("❌ MongoDB bağlantı hatası, yerel JSON'a devam ediliyor:", e.message);
  }
}

async function pullFromMongo(key, localFile) {
  if (!mongoReady) return;
  try {
    const doc = await mongoCol.findOne({ _id: key });
    if (doc && doc.value !== undefined) {
      fs.writeFileSync(localFile, JSON.stringify(doc.value, null, 2));
    }
  } catch (e) {
    console.error(`Mongo pull hata (${key}):`, e.message);
  }
}

async function pushToMongo(key, value) {
  if (!mongoReady) return;
  try {
    await mongoCol.updateOne({ _id: key }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
  } catch (e) {
    console.error(`Mongo push hata (${key}):`, e.message);
  }
}

// ===================== DATA / CONFIG =====================
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function saveJSON(file, data, mongoKey) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
  pushToMongo(mongoKey || path.basename(file), data).catch(() => {});
}

const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const GUARD_FILE = path.join(DATA_DIR, "guard.json");
const WHITELIST_FILE = path.join(DATA_DIR, "whitelist.json");
const STAFF_FILE = path.join(DATA_DIR, "staff.json");

let config, guardConfig, whitelist;

// ===================== CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

const ticketOwners = new Map(); // channelId -> openerId
const guardCounters = new Map(); // guildId -> Map(userId -> counters)
const aktiflikList = new Map(); // messageId -> aktiflik data
const activityStats = new Map(); // userId -> { lastMessageAt, lastVoiceJoinAt, ingameCount }
const roleGuardRevertLock = new Set(); // sonsuz döngü önleme
let aktiflikLogChannelId = null;

// ===================== HELPERS =====================
function baseEmbed(guild) {
  const authorIcon = guild?.iconURL?.({ size: 128 }) || undefined;
  return new EmbedBuilder()
    .setColor(NAVY)
    .setThumbnail(BOT_IMAGE_URL || null)
    .setAuthor({ name: PANEL_AUTHOR, iconURL: authorIcon })
    .setFooter({ text: FOOTER_TEXT, iconURL: authorIcon })
    .setTimestamp();
}
function createEmbed(guild, { title, description, fields, image }) {
  const e = baseEmbed(guild);
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (fields?.length) e.addFields(fields);
  if (image) e.setImage(image);
  return e;
}
async function replyE(interaction, embed, ephemeral = false) {
  const payload = { embeds: [embed] };
  if (ephemeral) payload.flags = 64;
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}
async function sendLog(guild, embed) {
  const ch = guild.channels.cache.get(config.logs?.guardLog || config.logChannelId);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

function noPerm(interaction) {
  return replyE(interaction, createEmbed(interaction.guild, {
    title: line(EMOJI.lock, "ʏᴇᴛᴋɪ ʏᴏᴋ"),
    description: line(EMOJI.warn, "Bu komutu kullanma yetkin yok.")
  }), false);
}

// ===================== GUARD SİSTEMİ =====================
function isGuardOwner(id) {
  return isOwner(id) || whitelist.has(id);
}
function saveGuard() { saveJSON(GUARD_FILE, guardConfig); }
function saveWhitelist() { saveJSON(WHITELIST_FILE, Array.from(whitelist)); }
function saveStaff() { saveJSON(STAFF_FILE, Array.from(staffIds)); }
function saveConfig() { saveJSON(CONFIG_FILE, config); }

// ===================== FiveM Cache =====================
let lastPlayersFetchAt = 0;
let cachedPlayersJson = null;

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await _fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function cleanFiveMName(name = "") {
  return String(name).replace(/\^\d/g, "").toLowerCase();
}

async function getServerPlayersCached() {
  const now = Date.now();
  if (cachedPlayersJson && now - lastPlayersFetchAt < 30000) return cachedPlayersJson;

  const url = `https://servers-frontend.fivem.net/api/servers/single/${CFX_CODE}`;
  const res = await fetchWithTimeout(url, {}, 5000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  cachedPlayersJson = json;
  lastPlayersFetchAt = now;
  return json;
}

async function getPlayerFromCFX(playerId) {
  const json = await getServerPlayersCached();
  const players = json?.Data?.players || [];
  const p = players.find((x) => String(x.id) === String(playerId));
  if (!p) return { found: false };

  const ids = Array.isArray(p.identifiers) ? p.identifiers : [];
  return {
    found: true,
    id: p.id,
    name: p.name,
    ping: p.ping,
    steam: ids.find((i) => i.startsWith("steam:")) || "Yok",
    discord: ids.find((i) => i.startsWith("discord:"))?.replace("discord:", "") || "Yok"
  };
}

// ===================== Aktivite Takip (aktiflik istatistikleri) =====================
function ensureActivity(id) {
  if (!activityStats.has(id)) {
    activityStats.set(id, { lastMessageAt: null, lastVoiceJoinAt: null, ingameCount: 0 });
  }
  return activityStats.get(id);
}
function touchLastMessage(id) { ensureActivity(id).lastMessageAt = Date.now(); }
function touchLastVoiceJoin(id) { ensureActivity(id).lastVoiceJoinAt = Date.now(); }
function touchIngameJoin(id) { ensureActivity(id).ingameCount += 1; }
function formatAgo(ms) {
  if (!ms) return "Hiç";
  const diff = Date.now() - ms;
  if (diff < 0) return "Az önce";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Az önce";
  if (min < 60) return `${min} dakika önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

function getCounterBucket(guildId) {
  if (!guardCounters.has(guildId)) guardCounters.set(guildId, new Map());
  return guardCounters.get(guildId);
}
function ensureUserCounter(guildId, userId) {
  const bucket = getCounterBucket(guildId);
  if (!bucket.has(userId)) {
    bucket.set(userId, { ban: 0, kick: 0, channel: 0, role: 0, lastReset: Date.now() });
  }
  return bucket.get(userId);
}
function maybeResetWindow(counter) {
  const windowMs = Math.max(1, Number(guardConfig.windowMinutes || 10)) * 60 * 1000;
  if (Date.now() - counter.lastReset >= windowMs) {
    counter.ban = 0; counter.kick = 0; counter.channel = 0; counter.role = 0;
    counter.lastReset = Date.now();
  }
}
function isGuardEnabled(systemKey) {
  if (!guardConfig.enabled) return false;
  if (!guardConfig.systems?.[systemKey]) return false;
  return true;
}
function getLimit(key) {
  const n = Number(guardConfig.limits?.[key] ?? 0);
  return Number.isNaN(n) ? 0 : Math.max(0, Math.floor(n));
}

function guardPanelEmbed(guild) {
  const on = `${EMOJI.success} ・ **AÇIK**`;
  const off = `${EMOJI.warn} ・ **KAPALI**`;
  const win = Math.max(1, Number(guardConfig.windowMinutes || 10));

  return createEmbed(guild, {
    title: line(EMOJI.shield, "ɢᴜᴀʀᴅ ᴘᴀɴᴇʟ"),
    description:
      `${EMOJI.settings} ・ **Sistem Durumu**\n` +
      `${EMOJI.ban} ・ Ban Guard: ${isGuardEnabled("ban") ? on : off}\n` +
      `${EMOJI.kick} ・ Kick Guard: ${isGuardEnabled("kick") ? on : off}\n` +
      `${EMOJI.trash} ・ Kanal Guard: ${isGuardEnabled("channel") ? on : off}\n` +
      `${EMOJI.crown} ・ Rol Guard: ${isGuardEnabled("role") ? on : off}\n\n` +
      `${EMOJI.info} ・ **Limitler (/${win} dk)**\n` +
      `${EMOJI.ban} ・ Ban Limit: **${getLimit("ban")}**\n` +
      `${EMOJI.kick} ・ Kick Limit: **${getLimit("kick")}**\n` +
      `${EMOJI.trash} ・ Kanal Silme Limit: **${getLimit("channel")}**\n` +
      `${EMOJI.crown} ・ Rol Silme Limit: **${getLimit("role")}**\n\n` +
      `${EMOJI.shield} ・ **Whitelist:** ${whitelist.size} kişi (guard'dan muaf)\n\n` +
      `${EMOJI.right} ・ Komutlar: \`/guard panel\` \`/guard limit\` \`/guard sistem\` \`/guard whitelist\``,
    image: BOT_IMAGE_URL || undefined
  });
}

async function fetchExecutor(guild, type) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 1, type });
    return logs.entries.first() || null;
  } catch {
    return null;
  }
}
async function punishMember(guild, userId, reason) {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;
    if (isGuardOwner(member.id)) return false;
    // Guard limit aşımında ban değil kick uygulanır
    await member.kick(reason).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
async function guardHit(guild, executorId, key, reasonText) {
  if (!guild || !executorId) return;
  if (isGuardOwner(executorId)) return;

  const limit = getLimit(key);
  if (limit === 0) return;

  const counter = ensureUserCounter(guild.id, executorId);
  maybeResetWindow(counter);
  counter[key] = (counter[key] || 0) + 1;

  await sendLog(guild, createEmbed(guild, {
    title: line(EMOJI.warn, "ɢᴜᴀʀᴅ ᴀʟᴀʀᴍ"),
    description:
      `${EMOJI.info} ・ İşlem: **${key.toUpperCase()}**\n` +
      `${EMOJI.right} ・ Yapan: <@${executorId}>\n` +
      `${EMOJI.settings} ・ Sayaç: **${counter[key]}/${limit}**\n` +
      `${EMOJI.warn} ・ Sebep: **${reasonText}**`,
    image: BOT_IMAGE_URL || undefined
  }));

  if (counter[key] >= limit) {
    const punished = await punishMember(guild, executorId, `GUARD: ${reasonText} (limit aşıldı)`);
    await sendLog(guild, createEmbed(guild, {
      title: line(EMOJI.lock, "ɢᴜᴀʀᴅ ᴍᴜᴅᴀʜᴀʟᴇ"),
      description:
        `${EMOJI.success} ・ Limit aşıldı, işlem uygulandı.\n` +
        `${EMOJI.right} ・ Yapan: <@${executorId}>\n` +
        `${EMOJI.settings} ・ Sistem: **${key.toUpperCase()}**\n` +
        `${EMOJI.info} ・ Sonuç: **${punished ? "Kick uygulandı" : "Üye bulunamadı / yetki yok"}**`,
      image: BOT_IMAGE_URL || undefined
    }));
  }
}

client.on("guildBanAdd", async (ban) => {
  try {
    const guild = ban.guild;
    if (!isGuardEnabled("ban")) return;
    const entry = await fetchExecutor(guild, 22);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(ban.user.id)) return;
    await guardHit(guild, entry.executor.id, "ban", `Üye banlandı: ${ban.user.tag}`);
  } catch {}
});
client.on("guildMemberRemove", async (member) => {
  try {
    const guild = member.guild;
    if (!isGuardEnabled("kick")) return;
    const entry = await fetchExecutor(guild, 20);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(member.id)) return;
    await guardHit(guild, entry.executor.id, "kick", `Üye kicklendi: ${member.user.tag}`);
  } catch {}
});
client.on("channelDelete", async (channel) => {
  try {
    const guild = channel.guild;
    if (!guild || !isGuardEnabled("channel")) return;
    const entry = await fetchExecutor(guild, 12);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(channel.id)) return;
    await guardHit(guild, entry.executor.id, "channel", `Kanal silindi: #${channel.name}`);
  } catch {}
});
client.on("roleDelete", async (role) => {
  try {
    const guild = role.guild;
    if (!guild || !isGuardEnabled("role")) return;
    const entry = await fetchExecutor(guild, 32);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(role.id)) return;
    await guardHit(guild, entry.executor.id, "role", `Rol silindi: ${role.name}`);
  } catch {}
});

// ===================== LOG EVENTS (ban/kick/kanal/rol → .setup kanalları) =====================
client.on("guildBanAdd", async (ban) => {
  const ch = ban.guild.channels.cache.get(config.logs?.banLog);
  if (!ch) return;
  ch.send({ embeds: [createEmbed(ban.guild, {
    title: line(EMOJI.ban, "ʙᴀɴ ʟᴏɢ"),
    description: `${EMOJI.info} ・ Kullanıcı: ${ban.user}\n${EMOJI.right} ・ ID: ${ban.user.id}`
  })] }).catch(() => {});
});
client.on("guildMemberRemove", async (member) => {
  const logs = await member.guild.fetchAuditLogs({ limit: 1, type: 20 }).catch(() => null);
  const entry = logs?.entries?.first();
  if (!entry || entry.action !== 20) return;
  const ch = member.guild.channels.cache.get(config.logs?.kickLog);
  if (!ch) return;
  ch.send({ embeds: [createEmbed(member.guild, {
    title: line(EMOJI.kick, "ᴋɪᴄᴋ ʟᴏɢ"),
    description: `${EMOJI.info} ・ Atılan: ${member.user}\n${EMOJI.right} ・ Yetkili: ${entry.executor}`
  })] }).catch(() => {});
});
client.on("channelDelete", async (channel) => {
  const ch = channel.guild.channels.cache.get(config.logs?.channelLog);
  if (!ch) return;
  ch.send({ embeds: [createEmbed(channel.guild, {
    title: line(EMOJI.warn, "ᴋᴀɴᴀʟ ꜱɪʟɪɴᴅɪ"),
    description: `${EMOJI.info} ・ İsim: ${channel.name}\n${EMOJI.right} ・ ID: ${channel.id}`
  })] }).catch(() => {});
});
client.on("roleDelete", async (role) => {
  const ch = role.guild.channels.cache.get(config.logs?.roleLog);
  if (!ch) return;
  ch.send({ embeds: [createEmbed(role.guild, {
    title: line(EMOJI.crown, "ʀᴏʟ ꜱɪʟɪɴᴅɪ"),
    description: `${EMOJI.info} ・ İsim: ${role.name}\n${EMOJI.right} ・ ID: ${role.id}`
  })] }).catch(() => {});
});

// ===================== AKTİFLİK İSTATİSTİK EVENTLERİ =====================
client.on("messageCreate", (message) => {
  if (!message.guild || message.author.bot) return;
  touchLastMessage(message.author.id);
});

client.on("voiceStateUpdate", (oldState, newState) => {
  try {
    const member = newState.member;
    if (!member || member.user.bot) return;
    if (!oldState.channelId && newState.channelId) {
      touchLastVoiceJoin(member.id);
    }
  } catch {}
});

// ===================== TICKET SİSTEMİ (butonlar) =====================
function isTicketOpen() {
  return (config.ticketDurum || "acik") === "acik";
}

function ticketPanelEmbed(guild) {
  const acik = isTicketOpen();
  const durumKutusu = "```\n[ DURUM: " + (acik ? "AKTİF" : "KAPALI") + " ]\n```";
  const aciklama = (config.ticketPanelMesaji || "").trim() ||
    "Sende kazananların tarafında olmak istiyorsan başvuru oluştur butonuna tıkla!";

  return createEmbed(guild, {
    title: config.ticketPanelBaslik || `${guild.name} | Başvuru Sistemi`,
    description: `${durumKutusu}\n${aciklama}`,
    image: TICKET_BANNER_URL || undefined
  });
}

function ticketPanelRow() {
  const acik = isTicketOpen();
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open")
      .setStyle(ButtonStyle.Primary)
      .setLabel(acik ? "Başvuru Oluştur" : "Başvurular Kapalı")
      .setEmoji("📝")
      .setDisabled(!acik)
  );
}

// /ticket panel çalıştığında gönderilen paneli hafızada tutar, /ticket durum ile canlı günceller
async function refreshTicketPanelMessage(guild) {
  if (!config.ticketPanelChannelId || !config.ticketPanelMessageId) return false;
  try {
    const ch = await guild.channels.fetch(config.ticketPanelChannelId).catch(() => null);
    if (!ch) return false;
    const msg = await ch.messages.fetch(config.ticketPanelMessageId).catch(() => null);
    if (!msg) return false;
    await msg.edit({ embeds: [ticketPanelEmbed(guild)], components: [ticketPanelRow()] });
    return true;
  } catch {
    return false;
  }
}

async function handleTicketOpen(interaction) {
  const guild = interaction.guild;
  await interaction.deferReply({ flags: 64 });

  if (!isTicketOpen()) {
    return interaction.editReply(`${EMOJI.warn} ・ Başvurular şu an kapalı.`);
  }

  if (!config.ticketCategoryId || !config.ticketStaffRoleId) {
    return interaction.editReply("Ticket sistemi ayarlı değil.");
  }
  const category = guild.channels.cache.get(config.ticketCategoryId);
  if (!category) return interaction.editReply("Ticket kategorisi geçersiz.");

  const safe = (interaction.user.username || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  const name = `basvuru-${safe}`;

  const existing = guild.channels.cache.find((c) => c.parentId === category.id && c.name === name);
  if (existing) return interaction.editReply(`Zaten açık ticketin var: ${existing}`);

  const ch = await guild.channels.create({
    name,
    parent: category.id,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: config.ticketStaffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ]
  });
  ticketOwners.set(ch.id, interaction.user.id);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`basvuru_kabul_${interaction.user.id}`).setLabel("Kabul Et").setStyle(ButtonStyle.Success).setEmoji(EMOJI.success),
    new ButtonBuilder().setCustomId(`basvuru_reddet_${interaction.user.id}`).setLabel("Reddet").setStyle(ButtonStyle.Danger).setEmoji(EMOJI.warn),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Kapat & Sil").setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.lock)
  );

  const basvuruFormu = `> **_Günde kaç saat aktif olabilirsin?:_**
> **_Kaç yaşındasın?:_**
> **_Oynadığın ekipler:_**
> **_FiveM'de kaç saatin var?:_**
> **_Gelişmiş map bilgin var mı?:_**
> **_En az 5/10 adet kill POV (zorunlu):_**
> **_ 5 Tane kill pov:_**
> **_Referansın var mı?:_**`;

  await ch.send({
    content: `<@${interaction.user.id}> | <@&${config.ticketStaffRoleId}>`,
    embeds: [createEmbed(guild, {
      title: `Hoş Geldin, ${interaction.user.username}`,
      description: `**Başvuru Formu**\n\n*Alttaki formu doldurup yetkili arkadaşların cevap vermesini beklemeden lütfen formu iletiniz.*\n\n${basvuruFormu}`,
      image: TICKET_BANNER_URL || undefined
    })],
    components: [row]
  });

  return interaction.editReply(`✅ Ticket açıldı: ${ch}`);
}

async function handleBasvuruKarar(interaction, kabul) {
  const guild = interaction.guild;
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isStaff(interaction.user.id) && !isAdmin) {
    return interaction.reply({ content: "❌ Bu işlemi yapma yetkin yok.", flags: 64 });
  }
  await interaction.deferReply({ flags: 64 });

  const applicantId = interaction.customId.replace(kabul ? "basvuru_kabul_" : "basvuru_reddet_", "");
  const member = await guild.members.fetch(applicantId).catch(() => null);

  if (kabul && !member) return interaction.editReply("❌ Başvuru sahibi sunucuda bulunamadı.");

  if (kabul) {
    const rolesToAdd = [];
    if (config.ekipRoleId && guild.roles.cache.has(config.ekipRoleId)) rolesToAdd.push(config.ekipRoleId);
    if (config.newRoleId && guild.roles.cache.has(config.newRoleId)) rolesToAdd.push(config.newRoleId);
    if (rolesToAdd.length) await member.roles.add(rolesToAdd).catch(() => {});
  }

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("basvuru_kabul_done").setLabel(kabul ? "Kabul Edildi" : "Kabul Et").setStyle(ButtonStyle.Success).setEmoji(EMOJI.success).setDisabled(true),
    new ButtonBuilder().setCustomId("basvuru_reddet_done").setLabel(kabul ? "Reddet" : "Reddedildi").setStyle(ButtonStyle.Danger).setEmoji(EMOJI.warn).setDisabled(true),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Kapat & Sil").setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.lock)
  );
  await interaction.message.edit({ components: [disabledRow] }).catch(() => {});

  await interaction.channel.send({
    embeds: [createEmbed(guild, {
      title: kabul ? line(EMOJI.success, "ʙᴀşᴠᴜʀᴜ ᴋᴀʙᴜʟ ᴇᴅɪʟᴅɪ") : line(EMOJI.warn, "ʙᴀşᴠᴜʀᴜ ʀᴇᴅᴅᴇᴅɪʟᴅɪ"),
      description: kabul
        ? `${EMOJI.success} ・ ${member} adlı kullanıcının başvurusu **kabul edildi** (<@${interaction.user.id}> tarafından).`
        : `${EMOJI.warn} ・ Başvuru **reddedildi** (<@${interaction.user.id}> tarafından).`
    })]
  }).catch(() => {});

  if (member) {
    await member.send({
      embeds: [createEmbed(guild, {
        title: kabul ? line(EMOJI.success, "ʙᴀşᴠᴜʀᴜɴ ᴋᴀʙᴜʟ ᴇᴅɪʟᴅɪ") : line(EMOJI.warn, "ʙᴀşᴠᴜʀᴜɴ ʀᴇᴅᴅᴇᴅɪʟᴅɪ"),
        description: kabul
          ? `${EMOJI.success} ・ Tebrikler! **${guild.name}** sunucusundaki başvurun kabul edildi.\n${EMOJI.right} ・ Ekibimize katıldığın için teşekkürler!`
          : `${EMOJI.warn} ・ **${guild.name}** sunucusundaki başvurun reddedildi.\n${EMOJI.right} ・ İlerleyen zamanlarda tekrar başvurabilirsin.`
      })]
    }).catch(() => {});
  }

  return interaction.editReply(kabul ? "✅ Başvuru kabul edildi, rol verildi ve kullanıcıya DM gönderildi." : "🔴 Başvuru reddedildi ve kullanıcıya DM gönderildi.");
}

async function handleTicketClose(interaction) {
  await interaction.deferReply({ flags: 64 });
  const opener = ticketOwners.get(interaction.channel.id);
  const admin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (interaction.user.id !== opener && !admin && !isStaff(interaction.user.id)) {
    return interaction.editReply("Yetkin yok.");
  }
  await interaction.channel.delete().catch(() => {});
  ticketOwners.delete(interaction.channel.id);
}

// ===================== INGAME (KATIL/AYRIL/İPTAL) SİSTEMİ =====================
const ingameList = new Map(); // mesajId -> { title, limit, users:[], endsAt, closed, timer, channelId, ownerId }

// "2 saat", "30 dakika", "1g 2sa", "45dk" gibi süre metinlerini ms'e çevirir
function parseDurationToMs(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(",", ".");

  let totalMs = 0;
  let matched = false;

  const dayMatch = t.match(/(\d+(?:\.\d+)?)\s*(g|gün|gun|d|day)\b/);
  const hourMatch = t.match(/(\d+(?:\.\d+)?)\s*(sa|saat|h|hr|hour)\b/);
  const minMatch = t.match(/(\d+(?:\.\d+)?)\s*(dk|dak|dakika|m|min)\b/);

  if (dayMatch) { totalMs += parseFloat(dayMatch[1]) * 86400000; matched = true; }
  if (hourMatch) { totalMs += parseFloat(hourMatch[1]) * 3600000; matched = true; }
  if (minMatch) { totalMs += parseFloat(minMatch[1]) * 60000; matched = true; }

  if (matched) return totalMs;

  // Sadece sayı verildiyse dakika say
  const onlyNum = t.match(/^(\d+(?:\.\d+)?)$/);
  if (onlyNum) return parseFloat(onlyNum[1]) * 60000;

  return null;
}

function formatRemaining(ms) {
  if (ms <= 0) return "Süre doldu";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} saat ${m} dakika sonra`;
  if (h > 0) return `${h} saat sonra`;
  return `${m} dakika sonra`;
}

function ingameRows(closed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ingame_join")
      .setLabel("Katıl")
      .setStyle(ButtonStyle.Success)
      .setEmoji(EMOJI.success)
      .setDisabled(!!closed),
    new ButtonBuilder()
      .setCustomId("ingame_leave")
      .setLabel("Ayrıl")
      .setStyle(ButtonStyle.Danger)
      .setEmoji(EMOJI.trash)
      .setDisabled(!!closed),
    new ButtonBuilder()
      .setCustomId("ingame_info")
      .setLabel("Bilgi")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(EMOJI.info),
    new ButtonBuilder()
      .setCustomId("ingame_cancel")
      .setLabel("İPTAL ET")
      .setStyle(ButtonStyle.Danger)
      .setEmoji(EMOJI.warn)
      .setDisabled(!!closed)
  );
}

function ingameEmbed(guild, data) {
  const list = data.users.length
    ? data.users.map((id, idx) => `**${idx + 1}.** <@${id}> \`${id}\``).join("\n")
    : `${EMOJI.warn} ・ Henüz katılan yok.`;

  const remaining = data.endsAt ? data.endsAt - Date.now() : null;

  return createEmbed(guild, {
    title: line(EMOJI.crown, data.title),
    description:
      `\`[ MAIN KADRO: ${data.users.length} / ${data.limit} ]\`\n\n` +
      `${EMOJI.info} ・ **Süre:** ${data.closed ? "Kapandı" : (remaining !== null ? formatRemaining(remaining) : "Belirsiz")}\n\n` +
      `${EMOJI.right} ・ **Katılımcılar**\n` +
      list,
    image: TICKET_BANNER_URL || undefined
  });
}

async function refreshIngameMessage(guild, msgId) {
  const data = ingameList.get(msgId);
  if (!data) return;
  const channel = guild.channels.cache.get(data.channelId);
  if (!channel) return;
  const msg = await channel.messages.fetch(msgId).catch(() => null);
  if (!msg) return;
  await msg.edit({
    embeds: [ingameEmbed(guild, data)],
    components: [ingameRows(data.closed)]
  }).catch(() => {});
}

async function closeIngame(guild, msgId, reason) {
  const data = ingameList.get(msgId);
  if (!data || data.closed) return;

  data.closed = true;
  if (data.timer) {
    clearTimeout(data.timer);
    data.timer = null;
  }

  await refreshIngameMessage(guild, msgId);

  const channel = guild.channels.cache.get(data.channelId);
  if (channel) {
    await channel.send({
      embeds: [
        createEmbed(guild, {
          title: line(EMOJI.lock, "ᴀʟɪᴍʟᴀʀ ᴋᴀᴘᴀɴᴅɪ"),
          description: `${EMOJI.info} ・ **${data.title}** için alımlar kapanmıştır.\n${EMOJI.right} ・ Sebep: **${reason}**`
        })
      ]
    }).catch(() => {});
  }
}

async function handleIngameJoin(interaction) {
  const data = ingameList.get(interaction.message.id);
  if (!data || data.closed) return interaction.reply({ content: `${EMOJI.warn} ・ Bu panel artık aktif değil.`, flags: 64 }).catch(() => {});
  if (data.users.includes(interaction.user.id)) {
    return interaction.reply({ content: `${EMOJI.info} ・ Zaten listedesin.`, flags: 64 }).catch(() => {});
  }
  if (data.users.length >= data.limit) {
    return interaction.reply({ content: `${EMOJI.warn} ・ Kontenjan dolu.`, flags: 64 }).catch(() => {});
  }
  data.users.push(interaction.user.id);
  touchIngameJoin(interaction.user.id);
  await refreshIngameMessage(interaction.guild, interaction.message.id);
  await interaction.reply({ content: `${EMOJI.success} ・ Kadroya katıldın!`, flags: 64 }).catch(() => {});

  if (data.users.length >= data.limit) {
    await closeIngame(interaction.guild, interaction.message.id, "Kontenjan doldu");
  }
}

async function handleIngameLeave(interaction) {
  const data = ingameList.get(interaction.message.id);
  if (!data) return interaction.reply({ content: `${EMOJI.warn} ・ Panel bulunamadı.`, flags: 64 }).catch(() => {});
  if (!data.users.includes(interaction.user.id)) {
    return interaction.reply({ content: `${EMOJI.info} ・ Zaten listede değilsin.`, flags: 64 }).catch(() => {});
  }
  data.users = data.users.filter((id) => id !== interaction.user.id);
  await refreshIngameMessage(interaction.guild, interaction.message.id);
  return interaction.reply({ content: `${EMOJI.trash} ・ Kadrodan ayrıldın.`, flags: 64 }).catch(() => {});
}

async function handleIngameInfo(interaction) {
  const data = ingameList.get(interaction.message.id);
  if (!data) return interaction.reply({ content: `${EMOJI.warn} ・ Panel bulunamadı.`, flags: 64 }).catch(() => {});
  const remaining = data.endsAt ? data.endsAt - Date.now() : null;
  return interaction.reply({
    embeds: [createEmbed(interaction.guild, {
      title: line(EMOJI.info, "ᴘᴀɴᴇʟ ʙɪʟɢɪꜱɪ"),
      description:
        `${EMOJI.right} ・ Başlık: **${data.title}**\n` +
        `${EMOJI.crown} ・ Kontenjan: **${data.users.length}/${data.limit}**\n` +
        `${EMOJI.info} ・ Süre: **${data.closed ? "Kapandı" : (remaining !== null ? formatRemaining(remaining) : "Belirsiz")}**\n` +
        `${EMOJI.settings} ・ Açan: <@${data.ownerId}>`
    })],
    flags: 64
  }).catch(() => {});
}

async function handleIngameCancel(interaction) {
  const data = ingameList.get(interaction.message.id);
  if (!data) return interaction.reply({ content: `${EMOJI.warn} ・ Panel bulunamadı.`, flags: 64 }).catch(() => {});
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (interaction.user.id !== data.ownerId && !isOwner(interaction.user.id) && !isStaff(interaction.user.id) && !isAdmin) {
    return interaction.reply({ content: `${EMOJI.lock} ・ Bu paneli iptal etme yetkin yok.`, flags: 64 }).catch(() => {});
  }
  await closeIngame(interaction.guild, interaction.message.id, `İptal edildi (${interaction.user.tag})`);
  return interaction.reply({ content: `${EMOJI.success} ・ Panel iptal edildi.`, flags: 64 }).catch(() => {});
}

// ===================== AKTİFLİK TESTİ =====================
function aktiflikRows(closed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("aktiflik_join")
      .setLabel("Aktifliğe Katıl")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
      .setDisabled(!!closed),
    new ButtonBuilder()
      .setCustomId("aktiflik_cancel")
      .setLabel("İptal Et")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔴")
      .setDisabled(!!closed)
  );
}

function aktiflikEmbed(guild, data) {
  const remaining = data.endsAt - Date.now();
  return createEmbed(guild, {
    title: `${EMOJI.star} ・ ᴀᴋᴛɪꜰʟɪᴋ ᴛᴇꜱᴛɪ ʙᴀşʟᴀᴅɪ`,
    description:
      `<@&${data.roleId}> ・ rolüne sahip kişilerin aktiflik testine katılımı **ZORUNLUDUR**.\n` +
      `${EMOJI.right} ・ Lütfen aşağıdaki butona tıklayarak katılım sağlayınız.\n` +
      `${EMOJI.warn} ・ Katılım sağlamayan kişiler süre sonunda tespit edilerek işlem yapılacaktır.\n\n` +
      `${EMOJI.info} ・ **Bitiş Zamanı:** ${data.closed ? "Sona erdi" : formatRemaining(remaining > 0 ? remaining : 0)}\n` +
      `${EMOJI.right} ・ **Katılımcı Sayısı:** ${data.joined.size} kişi`,
    image: TICKET_BANNER_URL || undefined
  });
}

async function refreshAktiflikMessage(guild, msgId) {
  const data = aktiflikList.get(msgId);
  if (!data) return;
  const channel = guild.channels.cache.get(data.channelId);
  if (!channel) return;
  const msg = await channel.messages.fetch(msgId).catch(() => null);
  if (!msg) return;
  await msg.edit({
    embeds: [aktiflikEmbed(guild, data)],
    components: [aktiflikRows(data.closed)]
  }).catch(() => {});
}

async function closeAktiflik(guild, msgId, reason) {
  const data = aktiflikList.get(msgId);
  if (!data || data.closed) return;

  data.closed = true;
  if (data.timer) {
    clearTimeout(data.timer);
    data.timer = null;
  }

  await refreshAktiflikMessage(guild, msgId);

  const role = guild.roles.cache.get(data.roleId);
  const logCh = aktiflikLogChannelId ? guild.channels.cache.get(aktiflikLogChannelId) : null;
  const announceCh = guild.channels.cache.get(data.channelId);

  if (!role) {
    if (announceCh) {
      await announceCh.send({
        embeds: [createEmbed(guild, {
          title: `${EMOJI.warn} ・ ʜᴀᴛᴀ`,
          description: `${EMOJI.warn} ・ Rol bulunamadı, aktiflik testi sonuçlandırılamadı.`
        })]
      }).catch(() => {});
    }
    return;
  }

  let members;
  try {
    members = await guild.members.fetch();
  } catch {
    members = guild.members.cache;
  }

  const roleMembers = members.filter((m) => !m.user.bot && m.roles.cache.has(data.roleId));
  const notJoined = roleMembers.filter((m) => !data.joined.has(m.id));

  if (announceCh) {
    await announceCh.send({
      embeds: [createEmbed(guild, {
        title: `${EMOJI.lock} ・ ᴀᴋᴛɪꜰʟɪᴋ ᴛᴇꜱᴛɪ ꜱᴏɴᴜ`,
        description:
          `${EMOJI.right} ・ <@&${data.roleId}> rolüne ait aktiflik testi sona erdi.\n` +
          `${EMOJI.warn} ・ **${notJoined.size}** kişi katılmadı.\n` +
          `${EMOJI.info} ・ Sebep: **${reason}**`
      })]
    }).catch(() => {});
  }

  if (!logCh) return;

  for (const [, member] of notJoined) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`aktiflik_kick_${member.id}_${data.roleId}`)
        .setLabel("Ekipten At")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🚫"),
      new ButtonBuilder()
        .setCustomId(`aktiflik_stats_${member.id}`)
        .setLabel("İstatistikler")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📊")
    );

    await logCh.send({
      embeds: [createEmbed(guild, {
        title: `${EMOJI.warn} ・ [AKTİFLİK SONUCU] <@&${data.roleId}> rolüne ait aktiflik testi sona erdi.`,
        description:
          `${EMOJI.right} ・ ${member} adlı kullanıcı \`(${member.id})\` ${new Date().toLocaleString("tr-TR")} tarihindeki ` +
          `aktiflik testine **katılmadı**.\n${EMOJI.info} ・ Aşağıdaki butonları kullanarak ilgili üye hakkında işlem yapabilirsiniz.`
      })],
      components: [row]
    }).catch(() => {});
  }
}

function statsEmbed(guild, member) {
  const stats = activityStats.get(member.id) || { lastMessageAt: null, lastVoiceJoinAt: null, ingameCount: 0 };
  return createEmbed(guild, {
    title: `${EMOJI.search} ・ ᴋᴜʟʟᴀɴɪᴄɪ ᴀᴋᴛɪꜰʟɪᴋ ɪꜱᴛᴀᴛɪꜱᴛɪɢɪ`,
    description:
      `${member} ・ adlı üyenin aktiflik analizi:\n\n` +
      `${EMOJI.right} ・ **Son Mesaj:** ${formatAgo(stats.lastMessageAt)}\n` +
      `${EMOJI.headphones} ・ **Son Sese Katılım:** ${formatAgo(stats.lastVoiceJoinAt)}\n` +
      `${EMOJI.star} ・ **Toplam İngame Katılımı:** ${stats.ingameCount} Defa`
  });
}

async function handleAktiflikJoin(interaction) {
  const msgId = interaction.message.id;
  const data = aktiflikList.get(msgId);
  if (!data) return interaction.reply({ content: "❌ Bu test artık aktif değil.", flags: 64 });
  if (data.closed) return interaction.reply({ content: "🔒 Bu test sona erdi.", flags: 64 });
  if (data.joined.has(interaction.user.id)) return interaction.reply({ content: "⚠️ Zaten katıldın.", flags: 64 });

  data.joined.add(interaction.user.id);
  await refreshAktiflikMessage(interaction.guild, msgId);
  return interaction.reply({ content: "✅ Aktiflik testine katılımın kaydedildi!", flags: 64 });
}

async function handleAktiflikCancel(interaction) {
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isStaff(interaction.user.id) && !isAdmin) {
    return interaction.reply({ content: "❌ Bu işlemi yapma yetkin yok.", flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });
  const msgId = interaction.message.id;
  const data = aktiflikList.get(msgId);
  if (!data) return interaction.editReply("❌ Bu test artık aktif değil.");
  if (data.closed) return interaction.editReply("⚠️ Bu test zaten kapalı.");

  data.closed = true;
  if (data.timer) {
    clearTimeout(data.timer);
    data.timer = null;
  }
  await refreshAktiflikMessage(interaction.guild, msgId);
  return interaction.editReply("🔴 Aktiflik testi iptal edildi. (Katılmayanlar listelenmedi.)");
}

async function handleAktiflikKick(interaction) {
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isStaff(interaction.user.id) && !isAdmin) {
    return interaction.reply({ content: "❌ Bu işlemi yapma yetkin yok.", flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });
  const parts = interaction.customId.replace("aktiflik_kick_", "").split("_");
  const targetId = parts[0];
  const roleId = parts[1];

  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!member) return interaction.editReply("❌ Üye sunucuda bulunamadı (zaten ayrılmış olabilir).");

  await member.roles.remove(roleId).catch(() => {});
  return interaction.editReply(`🚫 ${member} adlı üyenin rolü alındı (ekipten çıkarıldı).`);
}

async function handleAktiflikStats(interaction) {
  const targetId = interaction.customId.replace("aktiflik_stats_", "");
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!member) return interaction.reply({ content: "❌ Üye bulunamadı.", flags: 64 });
  return interaction.reply({ embeds: [statsEmbed(interaction.guild, member)], flags: 64 });
}

// ===================== SLASH KOMUTLARI =====================
const commands = [
  new SlashCommandBuilder()
    .setName("guard")
    .setDescription("Guard (anti-nuke) sistemi yönetimi")
    .addSubcommand((s) => s.setName("panel").setDescription("Guard panelini gösterir"))
    .addSubcommand((s) => s
      .setName("limit")
      .setDescription("Bir guard sisteminin limitini ayarlar")
      .addStringOption((o) => o.setName("sistem").setDescription("Sistem").setRequired(true)
        .addChoices({ name: "Ban", value: "ban" }, { name: "Kick", value: "kick" }, { name: "Kanal", value: "channel" }, { name: "Rol", value: "role" }))
      .addIntegerOption((o) => o.setName("miktar").setDescription("Yeni limit (0 = sınırsız)").setRequired(true).setMinValue(0)))
    .addSubcommand((s) => s
      .setName("sistem")
      .setDescription("Bir guard sistemini açar/kapatır")
      .addStringOption((o) => o.setName("sistem").setDescription("Sistem").setRequired(true)
        .addChoices({ name: "Ban", value: "ban" }, { name: "Kick", value: "kick" }, { name: "Kanal", value: "channel" }, { name: "Rol", value: "role" }))
      .addBooleanOption((o) => o.setName("durum").setDescription("Açık mı?").setRequired(true)))
    .addSubcommand((s) => s
      .setName("whitelist")
      .setDescription("Guard'dan muaf kullanıcıları yönetir")
      .addStringOption((o) => o.setName("islem").setDescription("İşlem").setRequired(true)
        .addChoices({ name: "Ekle", value: "ekle" }, { name: "Kaldır", value: "kaldir" }, { name: "Liste", value: "liste" }))
      .addUserOption((o) => o.setName("kullanici").setDescription("Kullanıcı (ekle/kaldır için)"))),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Log kanallarını (kategori + kanallar) otomatik kurar")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName("logkanal")
    .setDescription("Guard alarmlarının düşeceği genel log kanalını ayarlar")
    .addChannelOption((o) => o.setName("kanal").setDescription("Kanal").setRequired(true).addChannelTypes(ChannelType.GuildText)),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket / Başvuru sistemi yönetimi")
    .addSubcommand((s) => s
      .setName("kategori")
      .setDescription("Ticketlerin açılacağı kategoriyi ayarlar")
      .addChannelOption((o) => o.setName("kategori").setDescription("Kategori").setRequired(true).addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand((s) => s
      .setName("panel")
      .setDescription("Başvuru panelini gönderir")
      .addRoleOption((o) => o.setName("yetkili_rol").setDescription("Ticketleri görecek yetkili rolü").setRequired(true)))
    .addSubcommand((s) => s
      .setName("ekiprol")
      .setDescription("Başvuru kabul edilince verilecek ekip rolünü ayarlar")
      .addRoleOption((o) => o.setName("rol").setDescription("Rol").setRequired(true)))
    .addSubcommand((s) => s
      .setName("yenirol")
      .setDescription("Başvuru kabul edilince verilecek 'new' rolünü ayarlar")
      .addRoleOption((o) => o.setName("rol").setDescription("Rol").setRequired(true)))
    .addSubcommand((s) => s
      .setName("durum")
      .setDescription("Başvuru panelinin durumunu (aktif/kapalı) değiştirir")
      .addStringOption((o) => o.setName("durum").setDescription("Durum").setRequired(true)
        .addChoices({ name: "Aktif", value: "acik" }, { name: "Kapalı", value: "kapali" }))),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bir kullanıcıyı sunucudan yasaklar")
    .addUserOption((o) => o.setName("kullanici").setDescription("Yasaklanacak kullanıcı").setRequired(true))
    .addStringOption((o) => o.setName("sebep").setDescription("Ban sebebi").setRequired(false)),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Bir kullanıcıyı sunucudan atar")
    .addUserOption((o) => o.setName("kullanici").setDescription("Atılacak kullanıcı").setRequired(true))
    .addStringOption((o) => o.setName("sebep").setDescription("Kick sebebi").setRequired(false)),

  new SlashCommandBuilder()
    .setName("ses")
    .setDescription("Ses kanalı işlemleri")
    .addSubcommand((s) => s.setName("gir").setDescription("Botu bulunduğun ses kanalına sokar (kulaklık kapalı)")),

  new SlashCommandBuilder()
    .setName("sestopla")
    .setDescription("Sunucudaki tüm sesteki üyeleri senin bulunduğun kanala toplar"),

  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Bu kanalı silip aynısını yeniden oluşturarak temizler"),

  new SlashCommandBuilder()
    .setName("ingame")
    .setDescription("Kadro toplama (katıl/ayrıl/iptal) paneli sistemi")
    .addSubcommand((s) => s
      .setName("olustur")
      .setDescription("Yeni bir kadro toplama paneli açar")
      .addStringOption((o) => o.setName("baslik").setDescription("Panel başlığı").setRequired(true))
      .addIntegerOption((o) => o.setName("limit").setDescription("Maksimum katılımcı sayısı").setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName("sure").setDescription("Süre (ör: 2 saat, 30 dakika, 1g 2sa) - boş bırakılırsa süresiz").setRequired(false)))
    .addSubcommand((s) => s
      .setName("iptal")
      .setDescription("Bu kanaldaki aktif kadro panelini iptal eder")),

  new SlashCommandBuilder()
    .setName("yetkili")
    .setDescription("Yetkili listesini yönetir (guard hariç tüm komutları kullanabilirler)")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand((s) => s
      .setName("ekle")
      .setDescription("Kullanıcıyı yetkili yapar")
      .addUserOption((o) => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)))
    .addSubcommand((s) => s
      .setName("kaldir")
      .setDescription("Kullanıcıyı yetkililikten çıkarır")
      .addUserOption((o) => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)))
    .addSubcommand((s) => s
      .setName("liste")
      .setDescription("Yetkili listesini gösterir")),

  new SlashCommandBuilder()
    .setName("aktiflik")
    .setDescription("Aktiflik testi yönetimi")
    .addSubcommand((s) => s
      .setName("baslat")
      .setDescription("Belirtilen role aktiflik testi başlatır")
      .addRoleOption((o) => o.setName("rol").setDescription("Test yapılacak rol").setRequired(true))
      .addStringOption((o) => o.setName("sure").setDescription("Süre (ör: 30dk, 2sa, 3g)").setRequired(true)))
    .addSubcommand((s) => s
      .setName("log")
      .setDescription("Katılmayanların listeleneceği log kanalını ayarlar")
      .addChannelOption((o) => o.setName("kanal").setDescription("Log kanalı").setRequired(true).addChannelTypes(ChannelType.GuildText))),

  new SlashCommandBuilder()
    .setName("dm")
    .setDescription("Belirtilen roldeki tüm üyelere DM gönderir")
    .addRoleOption((o) => o.setName("rol").setDescription("Hedef rol").setRequired(true))
    .addStringOption((o) => o.setName("mesaj").setDescription("Gönderilecek mesaj").setRequired(true)),

  new SlashCommandBuilder()
    .setName("id")
    .setDescription("FiveM sunucusundaki oyuncu ID bilgisini gösterir")
    .addIntegerOption((o) => o.setName("oyuncu_id").setDescription("FiveM oyuncu ID").setRequired(true).setMinValue(0)),

  new SlashCommandBuilder()
    .setName("tag")
    .setDescription("FiveM sunucusunda isim/tag araması yapar")
    .addStringOption((o) => o.setName("arama").setDescription("Aranacak isim parçası").setRequired(true))
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log("✅ Slash komutlar sunucuya (anında) kaydedildi.");
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log("✅ Slash komutlar global kaydedildi (yayılması ~1 saat sürebilir).");
    }
  } catch (e) {
    console.error("❌ Komut kaydı başarısız:", e);
  }
}

// ===================== INTERACTION HANDLER =====================
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ---- BUTONLAR ----
    if (interaction.isButton()) {
      if (interaction.customId === "ticket_open") return handleTicketOpen(interaction);
      if (interaction.customId.startsWith("basvuru_kabul_")) return handleBasvuruKarar(interaction, true);
      if (interaction.customId.startsWith("basvuru_reddet_")) return handleBasvuruKarar(interaction, false);
      if (interaction.customId === "ticket_close") return handleTicketClose(interaction);
      if (interaction.customId === "ingame_join") return handleIngameJoin(interaction);
      if (interaction.customId === "ingame_leave") return handleIngameLeave(interaction);
      if (interaction.customId === "ingame_info") return handleIngameInfo(interaction);
      if (interaction.customId === "ingame_cancel") return handleIngameCancel(interaction);
      if (interaction.customId === "aktiflik_join") return handleAktiflikJoin(interaction);
      if (interaction.customId === "aktiflik_cancel") return handleAktiflikCancel(interaction);
      if (interaction.customId.startsWith("aktiflik_kick_")) return handleAktiflikKick(interaction);
      if (interaction.customId.startsWith("aktiflik_stats_")) return handleAktiflikStats(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, guild } = interaction;
    if (!guild) return;

    // ---- /guard ----
    if (commandName === "guard") {
      const sub = interaction.options.getSubcommand();

      if (sub === "panel") {
        if (!isGuardCommandUser(interaction.user.id)) return noPerm(interaction);
        return replyE(interaction, guardPanelEmbed(guild));
      }

      if (sub === "limit") {
        if (!isGuardCommandUser(interaction.user.id)) return noPerm(interaction);
        const sistem = interaction.options.getString("sistem");
        const miktar = interaction.options.getInteger("miktar");
        guardConfig.limits[sistem] = miktar;
        saveGuard();
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.success, "ʟɪᴍɪᴛ ɢᴜ̈ɴᴄᴇʟʟᴇɴᴅɪ"),
          description: line(EMOJI.info, `**${sistem.toUpperCase()}** limiti **${miktar}** olarak ayarlandı.`)
        }), false);
      }

      if (sub === "sistem") {
        if (!isGuardCommandUser(interaction.user.id)) return noPerm(interaction);
        const sistem = interaction.options.getString("sistem");
        const durum = interaction.options.getBoolean("durum");
        guardConfig.systems[sistem] = durum;
        saveGuard();
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.success, "ꜱɪꜱᴛᴇᴍ ɢᴜ̈ɴᴄᴇʟʟᴇɴᴅɪ"),
          description: line(EMOJI.info, `**${sistem.toUpperCase()}** guard **${durum ? "açıldı" : "kapatıldı"}**.`)
        }), false);
      }

      if (sub === "whitelist") {
        if (!isGuardCommandUser(interaction.user.id)) return noPerm(interaction);
        const islem = interaction.options.getString("islem");
        const kullanici = interaction.options.getUser("kullanici");

        if (islem === "liste") {
          const list = whitelist.size
            ? Array.from(whitelist).map((id, idx) => `**${idx + 1}.** <@${id}> \`(${id})\``).join("\n")
            : line(EMOJI.warn, "Whitelist boş.");
          return replyE(interaction, createEmbed(guild, { title: line(EMOJI.shield, `ᴡʜɪᴛᴇʟɪꜱᴛ (${whitelist.size})`), description: list }), false);
        }

        if (!kullanici) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.info, "ᴋᴜʟʟᴀɴɪᴍ"),
            description: line(EMOJI.right, "`/guard whitelist islem:ekle kullanici:@kişi`")
          }), false);
        }

        if (islem === "ekle") {
          whitelist.add(kullanici.id);
          saveWhitelist();
          return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴡʜɪᴛᴇʟɪꜱᴛ"), description: `${EMOJI.success} ・ ${kullanici} guard'dan muaf tutuldu.` }), false);
        }

        if (islem === "kaldir") {
          whitelist.delete(kullanici.id);
          saveWhitelist();
          return replyE(interaction, createEmbed(guild, { title: line(EMOJI.trash, "ᴡʜɪᴛᴇʟɪꜱᴛ"), description: `${EMOJI.warn} ・ ${kullanici} whitelist'ten çıkarıldı.` }), false);
        }
      }
      return;
    }

    // ---- /setup ----
    if (commandName === "setup") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      await interaction.deferReply();

      const category = await guild.channels.create({ name: "📂・ᴍᴏᴅᴇʀᴀsʏᴏɴ-ʟᴏɢs", type: ChannelType.GuildCategory });
      const logs = [
        { name: "・ban-log", key: "banLog" },
        { name: "・kick-log", key: "kickLog" },
        { name: "・rol-log", key: "roleLog" },
        { name: "・kanal-log", key: "channelLog" },
        { name: "・ticket-log", key: "ticketLog" },
        { name: "・guard-log", key: "guardLog" }
      ];
      if (!config.logs) config.logs = {};
      for (const l of logs) {
        const ch = await guild.channels.create({ name: l.name, type: ChannelType.GuildText, parent: category.id });
        config.logs[l.key] = ch.id;
      }
      config.logChannelId = config.logs.guardLog;
      saveConfig();

      return interaction.editReply({ embeds: [createEmbed(guild, {
        title: line(EMOJI.success, "ꜱᴇᴛᴜᴘ ᴛᴀᴍᴀᴍ"),
        description: `${EMOJI.settings} ・ Log kanalları başarıyla kuruldu.\n${EMOJI.right} ・ Toplam: **${logs.length} kanal**`
      })] });
    }

    // ---- /logkanal ----
    if (commandName === "logkanal") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const ch = interaction.options.getChannel("kanal");
      config.logChannelId = ch.id;
      saveConfig();
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ʟᴏɢ ᴀʏᴀʀʟᴀɴᴅɪ"), description: line(EMOJI.info, `ᴋᴀɴᴀʟ: ${ch}`) }), false);
    }

    // ---- /ticket ----
    if (commandName === "ticket") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const sub = interaction.options.getSubcommand();

      if (sub === "kategori") {
        const cat = interaction.options.getChannel("kategori");
        config.ticketCategoryId = cat.id;
        saveConfig();
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.success, "ᴋᴀᴛᴇɢᴏʀɪ ᴀʏᴀʀʟᴀɴᴅɪ"),
          description: `${line(EMOJI.info, `${cat}`)}\n${line(EMOJI.right, `ɪᴅ: \`${cat.id}\``)}`
        }), false);
      }

      if (sub === "panel") {
        const staffRole = interaction.options.getRole("yetkili_rol");
        if (!config.ticketCategoryId) {
          return replyE(interaction, createEmbed(guild, { title: line(EMOJI.warn, "ᴋᴀᴛᴇɢᴏʀɪ ʏᴏᴋ"), description: line(EMOJI.info, "Önce: `/ticket kategori`") }), false);
        }
        config.ticketStaffRoleId = staffRole.id;
        saveConfig();

        const panelMsg = await interaction.channel.send({ embeds: [ticketPanelEmbed(guild)], components: [ticketPanelRow()] }).catch(() => null);
        if (panelMsg) {
          config.ticketPanelChannelId = panelMsg.channel.id;
          config.ticketPanelMessageId = panelMsg.id;
          saveConfig();
        }
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴘᴀɴᴇʟ ɢᴏ̈ɴᴅᴇʀɪʟᴅɪ"), description: line(EMOJI.info, "Başvuru paneli kuruldu.") }), false);
      }

      if (sub === "durum") {
        const yeniDurum = interaction.options.getString("durum");
        config.ticketDurum = yeniDurum;
        saveConfig();
        const guncellendi = await refreshTicketPanelMessage(guild);
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.success, "ᴅᴜʀᴜᴍ ɢᴜ̈ɴᴄᴇʟʟᴇɴᴅɪ"),
          description:
            `${EMOJI.info} ・ Başvuru durumu **${yeniDurum === "acik" ? "AKTİF" : "KAPALI"}** olarak ayarlandı.\n` +
            `${EMOJI.right} ・ Panel mesajı: **${guncellendi ? "güncellendi ✅" : "bulunamadı, /ticket panel ile yeniden gönder"}**`
        }), false);
      }

      if (sub === "ekiprol") {
        const rol = interaction.options.getRole("rol");
        config.ekipRoleId = rol.id;
        saveConfig();
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ᴇᴋɪᴘ ʀᴏʟᴜ̈ ᴀʏᴀʀʟᴀɴᴅɪ"), description: line(EMOJI.info, `${rol}`) }), false);
      }

      if (sub === "yenirol") {
        const rol = interaction.options.getRole("rol");
        config.newRoleId = rol.id;
        saveConfig();
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ʏᴇɴɪ ʀᴏʟ ᴀʏᴀʀʟᴀɴᴅɪ"), description: line(EMOJI.info, `${rol}`) }), false);
      }
    }

    // ---- /ban ----
    if (commandName === "ban") {
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers);
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id) && !isAdmin) return noPerm(interaction);

      const kullanici = interaction.options.getUser("kullanici");
      const sebep = interaction.options.getString("sebep") || "Sebep belirtilmedi";
      const hedefUye = await guild.members.fetch(kullanici.id).catch(() => null);

      if (hedefUye && !hedefUye.bannable) {
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.lock, "ʙᴀɴʟᴀɴᴀᴍᴀᴢ"),
          description: line(EMOJI.warn, "Bu kullanıcıyı banlama yetkim yok (rol hiyerarşisi).")
        }), false);
      }

      await guild.members.ban(kullanici.id, { reason: sebep }).catch(() => {});
      return replyE(interaction, createEmbed(guild, {
        title: line(EMOJI.ban, "ᴜ̈ʏᴇ ʙᴀɴʟᴀɴᴅɪ"),
        description:
          `${EMOJI.info} ・ Kullanıcı: ${kullanici} \`(${kullanici.id})\`\n` +
          `${EMOJI.right} ・ Sebep: **${sebep}**\n` +
          `${EMOJI.crown} ・ Yetkili: ${interaction.user}`
      }), false);
    }

    // ---- /kick ----
    if (commandName === "kick") {
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers);
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id) && !isAdmin) return noPerm(interaction);

      const kullanici = interaction.options.getUser("kullanici");
      const sebep = interaction.options.getString("sebep") || "Sebep belirtilmedi";
      const hedefUye = await guild.members.fetch(kullanici.id).catch(() => null);

      if (!hedefUye) {
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.warn, "ᴜ̈ʏᴇ ʙᴜʟᴜɴᴀᴍᴀᴅɪ"),
          description: line(EMOJI.info, "Bu kullanıcı sunucuda bulunamadı.")
        }), false);
      }
      if (!hedefUye.kickable) {
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.lock, "ᴀᴛɪʟᴀᴍᴀᴢ"),
          description: line(EMOJI.warn, "Bu kullanıcıyı atma yetkim yok (rol hiyerarşisi).")
        }), false);
      }

      await hedefUye.kick(sebep).catch(() => {});
      return replyE(interaction, createEmbed(guild, {
        title: line(EMOJI.kick, "ᴜ̈ʏᴇ ᴀᴛɪʟᴅɪ"),
        description:
          `${EMOJI.info} ・ Kullanıcı: ${kullanici} \`(${kullanici.id})\`\n` +
          `${EMOJI.right} ・ Sebep: **${sebep}**\n` +
          `${EMOJI.crown} ・ Yetkili: ${interaction.user}`
      }), false);
    }

    // ---- /ses ----
    if (commandName === "ses") {
      const sub = interaction.options.getSubcommand();
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);

      if (sub === "gir") {
        const vc = interaction.member.voice.channel;
        if (!vc) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.warn, "ꜱᴇꜱ ᴋᴀɴᴀʟɪ ʏᴏᴋ"),
            description: line(EMOJI.info, "Önce bir ses kanalına girmelisin.")
          }), false);
        }

        try {
          joinVoiceChannel({
            channelId: vc.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false
          });
        } catch (e) {
          console.error("Ses kanalına girme hatası:", e);
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.warn, "ʜᴀᴛᴀ"),
            description: line(EMOJI.info, "Ses kanalına girilemedi. `@discordjs/voice` paketinin kurulu olduğundan emin ol.")
          }), false);
        }

        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.success, "ꜱᴇꜱᴇ ɢɪʀɪʟᴅɪ"),
          description: `${EMOJI.info} ・ Kanal: ${vc}\n${EMOJI.right} ・ Kulaklık: **kapalı**`
        }), false);
      }
    }

    // ---- /sestopla ----
    if (commandName === "sestopla") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);

      const hedefKanal = interaction.member.voice.channel;
      if (!hedefKanal) {
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.warn, "ꜱᴇꜱ ᴋᴀɴᴀʟɪ ʏᴏᴋ"),
          description: line(EMOJI.info, "Önce bir ses kanalına girmelisin, herkes buraya toplanacak.")
        }), false);
      }

      let tasinan = 0;
      const sesKanallari = guild.channels.cache.filter((c) => c.isVoiceBased() && c.id !== hedefKanal.id);
      for (const [, kanal] of sesKanallari) {
        for (const [, uye] of kanal.members) {
          const ok = await uye.voice.setChannel(hedefKanal).then(() => true).catch(() => false);
          if (ok) tasinan++;
        }
      }

      return replyE(interaction, createEmbed(guild, {
        title: line(EMOJI.success, "ꜱᴇꜱ ᴛᴏᴘʟᴀɴᴅɪ"),
        description: `${EMOJI.info} ・ Hedef kanal: ${hedefKanal}\n${EMOJI.right} ・ Taşınan üye: **${tasinan}**`
      }), false);
    }

    // ---- /nuke ----
    if (commandName === "nuke") {
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id) && !isAdmin) return noPerm(interaction);

      const eskiKanal = interaction.channel;
      if (eskiKanal.type !== ChannelType.GuildText) {
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.warn, "ᴅᴇꜱᴛᴇᴋʟᴇɴᴍɪʏᴏʀ"),
          description: line(EMOJI.info, "`/nuke` sadece metin kanallarında kullanılabilir.")
        }), false);
      }

      await interaction.deferReply().catch(() => {});
      const eskiPozisyon = eskiKanal.position;
      const yeniKanal = await eskiKanal.clone({ reason: `Nuke: ${interaction.user.tag}` }).catch(() => null);
      if (!yeniKanal) {
        return interaction.editReply(line(EMOJI.warn, "Kanal klonlanamadı, kanal izinlerini kontrol et.")).catch(() => {});
      }
      await yeniKanal.setPosition(eskiPozisyon).catch(() => {});
      await eskiKanal.delete(`Nuke: ${interaction.user.tag}`).catch(() => {});

      await yeniKanal.send({
        embeds: [createEmbed(guild, {
          title: line(EMOJI.success, "ᴋᴀɴᴀʟ ᴛᴇᴍɪᴢʟᴇɴᴅɪ"),
          description: `${EMOJI.info} ・ Bu kanal <@${interaction.user.id}> tarafından temizlendi.`,
          image: BOT_IMAGE_URL || undefined
        })]
      }).catch(() => {});
      return;
    }

    // ---- /ingame ----
    if (commandName === "ingame") {
      const sub = interaction.options.getSubcommand();
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);

      if (sub === "olustur") {
        const baslik = interaction.options.getString("baslik");
        const limit = interaction.options.getInteger("limit");
        const sureText = interaction.options.getString("sure");
        const durationMs = parseDurationToMs(sureText);

        const data = {
          title: baslik,
          limit,
          users: [],
          endsAt: durationMs ? Date.now() + durationMs : null,
          closed: false,
          timer: null,
          channelId: interaction.channel.id,
          ownerId: interaction.user.id
        };

        await interaction.reply({ embeds: [ingameEmbed(guild, data)], components: [ingameRows(false)] });
        const msg = await interaction.fetchReply();
        ingameList.set(msg.id, data);

        if (durationMs) {
          data.timer = setTimeout(() => closeIngame(guild, msg.id, "Süre doldu"), durationMs);
        }
        return;
      }

      if (sub === "iptal") {
        const entry = Array.from(ingameList.entries()).find(([, d]) => d.channelId === interaction.channel.id && !d.closed);
        if (!entry) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.warn, "ᴘᴀɴᴇʟ ʙᴜʟᴜɴᴀᴍᴀᴅɪ"),
            description: line(EMOJI.info, "Bu kanalda aktif bir kadro paneli yok.")
          }), false);
        }
        await closeIngame(guild, entry[0], `İptal edildi (${interaction.user.tag})`);
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.success, "ᴘᴀɴᴇʟ ɪᴘᴛᴀʟ ᴇᴅɪʟᴅɪ"),
          description: line(EMOJI.info, "Kadro paneli iptal edildi.")
        }), false);
      }
    }

    // ---- /yetkili ----
    if (commandName === "yetkili") {
      // Sadece owner'lar yetkili ekleyip çıkarabilir (guard yetkisiyle karışmasın diye ayrı tutuldu)
      if (!isOwner(interaction.user.id)) return noPerm(interaction);
      const sub = interaction.options.getSubcommand();

      if (sub === "liste") {
        const list = staffIds.size
          ? Array.from(staffIds).map((id, idx) => `**${idx + 1}.** <@${id}> \`(${id})\``).join("\n")
          : line(EMOJI.warn, "Yetkili listesi boş.");
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.crown, `ʏᴇᴛᴋɪʟɪ ʟɪꜱᴛᴇꜱɪ (${staffIds.size})`),
          description: list
        }), false);
      }

      const kullanici = interaction.options.getUser("kullanici");

      if (sub === "ekle") {
        if (isOwner(kullanici.id)) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.info, "ɢᴇʀᴇᴋꜱɪᴢ"),
            description: line(EMOJI.info, "Bu kullanıcı zaten sahip (owner).")
          }), false);
        }
        staffIds.add(kullanici.id);
        saveStaff();
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.success, "ʏᴇᴛᴋɪʟɪ ᴇᴋʟᴇɴᴅɪ"),
          description: `${EMOJI.success} ・ ${kullanici} artık yetkili.\n${EMOJI.right} ・ Guard hariç tüm komutları kullanabilir.`
        }), false);
      }

      if (sub === "kaldir") {
        staffIds.delete(kullanici.id);
        saveStaff();
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.trash, "ʏᴇᴛᴋɪʟɪ ᴋᴀʟᴅɪʀɪʟᴅɪ"),
          description: `${EMOJI.warn} ・ ${kullanici} yetkili listesinden çıkarıldı.`
        }), false);
      }
    }

    // ---- /aktiflik ----
    if (commandName === "aktiflik") {
      const sub = interaction.options.getSubcommand();

      if (sub === "baslat") {
        if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);

        const role = interaction.options.getRole("rol");
        const sureText = interaction.options.getString("sure");
        const durationMs = parseDurationToMs(sureText);

        if (!durationMs || durationMs <= 0) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.info, "ᴋᴜʟʟᴀɴɪᴍ"),
            description:
              `${line(EMOJI.right, "`/aktiflik baslat rol:@rol sure:3g`")}\n` +
              `${EMOJI.info} ・ Süre örnekleri: \`30dk\`, \`2sa\`, \`1g 2sa\`, \`3g\`\n` +
              `${EMOJI.warn} ・ Log kanalı: \`/aktiflik log kanal:#kanal\``
          }), false);
        }

        const endsAt = Date.now() + durationMs;
        const data = {
          roleId: role.id,
          durationMs,
          endsAt,
          joined: new Set(),
          closed: false,
          timer: null,
          channelId: interaction.channel.id,
          guildId: guild.id
        };

        const msg = await interaction.channel.send({
          content: `${role}`,
          embeds: [aktiflikEmbed(guild, data)],
          components: [aktiflikRows(false)]
        });

        aktiflikList.set(msg.id, data);
        data.timer = setTimeout(() => {
          closeAktiflik(guild, msg.id, "Süre doldu").catch(() => {});
        }, durationMs);

        if (!aktiflikLogChannelId) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.warn, "ᴜʏᴀʀɪ"),
            description:
              `${EMOJI.success} ・ Aktiflik testi başlatıldı.\n` +
              `${EMOJI.warn} ・ Log kanalı ayarlı değil — test bitince katılmayanlar listelenmeyecek.\n` +
              `${EMOJI.right} ・ Ayarlamak için: \`/aktiflik log kanal:#kanal\``
          }), false);
        }

        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.success, "ᴀᴋᴛɪꜰʟɪᴋ ʙᴀşʟᴀᴅɪ"),
          description: `${EMOJI.success} ・ Aktiflik testi başlatıldı.`
        }), false);
      }

      if (sub === "log") {
        if (!isOwner(interaction.user.id)) return noPerm(interaction);
        const ch = interaction.options.getChannel("kanal");
        aktiflikLogChannelId = ch.id;
        config.aktiflikLogChannelId = ch.id;
        saveConfig();
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.success, "ᴋᴀʏᴅᴇᴅɪʟᴅɪ"),
          description: `${EMOJI.success} ・ Aktiflik log kanalı ${ch} olarak ayarlandı.`
        }), false);
      }
    }

    // ---- /dm ----
    if (commandName === "dm") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);

      const role = interaction.options.getRole("rol");
      const text = interaction.options.getString("mesaj");

      await interaction.deferReply({ flags: 64 });

      let sent = 0;
      let fail = 0;

      for (const member of role.members.values()) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          await member.send(text);
          sent++;
        } catch {
          fail++;
        }
      }

      return interaction.editReply({
        embeds: [createEmbed(guild, {
          title: line(EMOJI.success, "ᴅᴍ ɢᴏ̈ɴᴅᴇʀɪʟᴅɪ"),
          description:
            `${line(EMOJI.info, `Başarılı: ${sent}`)}\n` +
            `${line(EMOJI.warn, `Başarısız: ${fail}`)}`
        })]
      });
    }

    // ---- /id ----
    if (commandName === "id") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);

      const playerId = interaction.options.getInteger("oyuncu_id");

      try {
        const data = await getPlayerFromCFX(playerId);

        if (!data.found) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.warn, "ʙᴜʟᴜɴᴀᴍᴀᴅɪ"),
            description: line(EMOJI.warn, "Oyuncu bulunamadı.")
          }), false);
        }

        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.fivem, "ꜰɪᴠᴇᴍ ᴏʏᴜɴᴄᴜ"),
          fields: [
            { name: line(EMOJI.info, "İsim"), value: `\`${data.name}\`` },
            { name: line(EMOJI.settings, "ID"), value: `\`${data.id}\``, inline: true },
            { name: line(EMOJI.right, "Ping"), value: `\`${data.ping}\``, inline: true },
            { name: line(EMOJI.search, "Steam"), value: `\`${data.steam}\`` },
            { name: line(EMOJI.search, "Discord"), value: `\`${data.discord}\`` }
          ]
        }), false);
      } catch (err) {
        console.error("ID CMD ERROR:", err);
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.warn, "ᴀᴘɪ ʜᴀᴛᴀ"),
          description: line(EMOJI.warn, err?.message || "FiveM API bağlantı hatası")
        }), false);
      }
    }

    // ---- /tag ----
    if (commandName === "tag") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);

      const search = interaction.options.getString("arama").trim();
      if (!search) {
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.info, "ᴋᴜʟʟᴀɴɪᴍ"),
          description: line(EMOJI.right, "`/tag arama:kaisen`")
        }), false);
      }

      try {
        const json = await getServerPlayersCached();
        const players = json?.Data?.players || [];
        const matched = players.filter((p) => cleanFiveMName(p.name).includes(search.toLowerCase()));

        if (!matched.length) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.warn, "ʙᴜʟᴜɴᴀᴍᴀᴅɪ"),
            description: line(EMOJI.warn, "Oyuncu bulunamadı.")
          }), false);
        }

        const list = matched
          .slice(0, 25)
          .map((p) => `${EMOJI.right} ・ **${p.name}** (ID: \`${p.id}\` | Ping: \`${p.ping}\`)`)
          .join("\n");

        return replyE(interaction, createEmbed(guild, {
          title: `${EMOJI.search} ・ ᴛᴀɢ ᴀʀᴀᴍᴀ`,
          description: `${EMOJI.success} ・ Toplam: **${matched.length} kişi**\n\n${list}`
        }), false);
      } catch (err) {
        console.error("TAG ERROR:", err);
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.warn, "ᴀᴘɪ ʜᴀᴛᴀ"),
          description: line(EMOJI.warn, err?.message || "FiveM API bağlantı hatası")
        }), false);
      }
    }
  } catch (e) {
    console.error("Interaction hata:", e);
  }
});

// ===================== PRESENCE / READY =====================
function setBotPresence() {
  if (!client.user) return;
  client.user.setPresence({ activities: [{ name: "Vazgucxn 🤍 Knesta", type: ActivityType.Playing }], status: "dnd" });
}
client.once(Events.ClientReady, () => {
  console.log(`🟢 Bot aktif: ${client.user.tag}`);
  setBotPresence();
  setInterval(setBotPresence, 5 * 60 * 1000);
});
setInterval(() => console.log("🟢 BOT ALIVE:", new Date().toISOString()), 60_000);

// ===================== KNESTA WEB PANEL (YÖNETİM PANELİ) =====================
const crypto = require("crypto");

const PANEL_PASSWORD_ENV = (process.env.PANEL_PASSWORD || "").trim();
const PANEL_PASSWORD = PANEL_PASSWORD_ENV || crypto.randomBytes(9).toString("base64url");
if (!PANEL_PASSWORD_ENV) {
  console.warn("⚠️ PANEL_PASSWORD env değişkeni tanımlı değil!");
  console.warn("⚠️ Geçici şifre (yeniden başlatınca değişir): " + PANEL_PASSWORD);
  console.warn("⚠️ Railway → Variables → PANEL_PASSWORD ekleyerek kalıcı bir şifre belirle.");
}
const GUILD_NAME_LABEL = (process.env.PANEL_SERVER_NAME || "Knesta").trim();

const PANEL_HTML = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Knesta • Yönetim Paneli</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
  :root{
    --bg:#0a0b12; --bg2:#0f1220; --panel:#12141f; --panel2:#181b2b;
    --border:#232640; --text:#eef0ff; --muted:#8b8fb0; --muted2:#5f6389;
    --accent:#7c5cff; --accent2:#00d2ff; --danger:#ff4d6d; --success:#2ee6a6; --warn:#ffb020;
    --radius:16px; --shadow: 0 20px 60px rgba(0,0,0,.45);
  }
  *{box-sizing:border-box; margin:0; padding:0;}
  html,body{height:100%;}
  body{
    font-family:'Inter',sans-serif; background:
      radial-gradient(1200px 600px at 10% -10%, rgba(124,92,255,.18), transparent 60%),
      radial-gradient(1000px 700px at 110% 10%, rgba(0,210,255,.14), transparent 55%),
      var(--bg);
    color:var(--text); min-height:100%; overflow-x:hidden;
  }
  ::selection{background:var(--accent); color:#fff;}
  ::-webkit-scrollbar{width:8px; height:8px;}
  ::-webkit-scrollbar-thumb{background:#2a2d45; border-radius:8px;}
  ::-webkit-scrollbar-track{background:transparent;}
  a{color:inherit; text-decoration:none;}
  h1,h2,h3{font-family:'Poppins',sans-serif;}

  /* ---------- LOGIN ---------- */
  #login{min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; position:relative;}
  .blob{position:absolute; border-radius:50%; filter:blur(80px); opacity:.5; z-index:0;}
  .blob1{width:420px; height:420px; background:var(--accent); top:-120px; left:-120px;}
  .blob2{width:380px; height:380px; background:var(--accent2); bottom:-140px; right:-100px;}
  .login-card{
    position:relative; z-index:1; width:100%; max-width:400px; background:rgba(18,20,31,.75);
    backdrop-filter:blur(20px); border:1px solid var(--border); border-radius:var(--radius);
    padding:40px 32px; box-shadow:var(--shadow); text-align:center;
    animation:rise .5s ease;
  }
  @keyframes rise{ from{opacity:0; transform:translateY(16px);} to{opacity:1; transform:translateY(0);} }
  .brand-logo{
    width:64px; height:64px; border-radius:18px; margin:0 auto 18px; display:flex; align-items:center; justify-content:center;
    background:linear-gradient(135deg, var(--accent), var(--accent2)); font-size:28px; font-weight:800; font-family:'Poppins',sans-serif;
    box-shadow:0 10px 30px rgba(124,92,255,.4);
  }
  .login-card h1{font-size:24px; font-weight:800; letter-spacing:.5px;}
  .login-card p.sub{color:var(--muted); font-size:13px; margin-top:6px; margin-bottom:26px;}
  .field{position:relative; margin-bottom:14px; text-align:left;}
  .field i.icon-left{position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--muted2); font-size:14px;}
  .field input{
    width:100%; padding:14px 44px; background:var(--panel2); border:1px solid var(--border); border-radius:12px;
    color:var(--text); font-size:14px; font-family:'Inter',sans-serif; outline:none; transition:.2s;
  }
  .field input:focus{border-color:var(--accent); box-shadow:0 0 0 3px rgba(124,92,255,.2);}
  .field .toggle-eye{position:absolute; right:14px; top:50%; transform:translateY(-50%); color:var(--muted2); cursor:pointer; font-size:14px;}
  .btn{
    width:100%; padding:14px; border:none; border-radius:12px; font-weight:700; font-size:14px; cursor:pointer;
    background:linear-gradient(135deg, var(--accent), var(--accent2)); color:#fff; transition:.2s; font-family:'Inter',sans-serif;
    display:flex; align-items:center; justify-content:center; gap:8px;
  }
  .btn:hover{filter:brightness(1.1); transform:translateY(-1px);}
  .btn:active{transform:translateY(0);}
  .btn:disabled{opacity:.6; cursor:not-allowed; transform:none;}
  .btn.secondary{background:var(--panel2); border:1px solid var(--border); color:var(--text);}
  .btn.danger{background:linear-gradient(135deg,#ff4d6d,#ff7a5c);}
  .btn.small{padding:8px 12px; font-size:12px; width:auto;}
  .err-box{
    background:rgba(255,77,109,.12); border:1px solid rgba(255,77,109,.35); color:#ff8fa3;
    font-size:12.5px; padding:10px 12px; border-radius:10px; margin-bottom:14px; display:none; text-align:left;
  }
  .spinner{width:16px; height:16px; border:2px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .lock-badge{display:flex; align-items:center; justify-content:center; gap:6px; color:var(--muted2); font-size:11.5px; margin-top:18px;}

  /* ---------- APP LAYOUT ---------- */
  #app{display:none; min-height:100vh;}
  .layout{display:flex; min-height:100vh;}
  .sidebar{
    width:250px; flex-shrink:0; background:rgba(15,17,28,.9); border-right:1px solid var(--border);
    display:flex; flex-direction:column; padding:22px 16px; position:sticky; top:0; height:100vh; backdrop-filter:blur(10px);
  }
  .sidebar .brand{display:flex; align-items:center; gap:12px; padding:6px 8px 22px;}
  .sidebar .brand .logo{
    width:38px; height:38px; border-radius:11px; background:linear-gradient(135deg,var(--accent),var(--accent2));
    display:flex; align-items:center; justify-content:center; font-weight:800; font-family:'Poppins',sans-serif; font-size:16px;
  }
  .sidebar .brand .name{font-family:'Poppins',sans-serif; font-weight:700; font-size:16px;}
  .sidebar .brand .name span{display:block; font-size:11px; color:var(--muted); font-weight:500;}
  .nav{display:flex; flex-direction:column; gap:4px; flex:1;}
  .nav-item{
    display:flex; align-items:center; gap:12px; padding:11px 14px; border-radius:11px; color:var(--muted);
    font-size:13.5px; font-weight:600; cursor:pointer; transition:.15s; border:1px solid transparent;
  }
  .nav-item i{width:18px; text-align:center; font-size:14px;}
  .nav-item:hover{background:var(--panel2); color:var(--text);}
  .nav-item.active{background:linear-gradient(135deg, rgba(124,92,255,.18), rgba(0,210,255,.1)); color:#fff; border-color:rgba(124,92,255,.35);}
  .nav-sep{font-size:10.5px; text-transform:uppercase; letter-spacing:1px; color:var(--muted2); margin:14px 8px 4px; font-weight:700;}
  .sidebar-footer{border-top:1px solid var(--border); padding-top:14px; margin-top:8px;}

  .main{flex:1; min-width:0; padding:26px 32px 60px;}
  .topbar{display:flex; align-items:center; justify-content:space-between; margin-bottom:26px; flex-wrap:wrap; gap:12px;}
  .topbar h2{font-size:22px; font-weight:800;}
  .topbar .desc{color:var(--muted); font-size:13px; margin-top:3px;}
  .pill{display:inline-flex; align-items:center; gap:6px; background:var(--panel2); border:1px solid var(--border); padding:7px 13px; border-radius:100px; font-size:12px; font-weight:600;}
  .dot{width:7px; height:7px; border-radius:50%; background:var(--success); box-shadow:0 0 8px var(--success);}
  .dot.off{background:var(--danger); box-shadow:0 0 8px var(--danger);}

  .grid{display:grid; gap:16px;}
  .grid.stats{grid-template-columns:repeat(auto-fit, minmax(200px,1fr));}
  .card{
    background:linear-gradient(180deg, var(--panel), var(--panel2)); border:1px solid var(--border); border-radius:var(--radius);
    padding:20px; position:relative; overflow:hidden;
  }
  .card.stat .icon{
    width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:17px; margin-bottom:14px;
  }
  .card.stat .icon.purple{background:rgba(124,92,255,.15); color:var(--accent);}
  .card.stat .icon.cyan{background:rgba(0,210,255,.15); color:var(--accent2);}
  .card.stat .icon.green{background:rgba(46,230,166,.15); color:var(--success);}
  .card.stat .icon.orange{background:rgba(255,176,32,.15); color:var(--warn);}
  .card.stat .val{font-size:26px; font-weight:800; font-family:'Poppins',sans-serif;}
  .card.stat .lbl{color:var(--muted); font-size:12.5px; margin-top:2px;}
  .section{display:none;}
  .section.active{display:block; animation:fadein .35s ease;}
  @keyframes fadein{from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:translateY(0);}}

  .toolbar{display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px; align-items:center;}
  .search{
    flex:1; min-width:220px; display:flex; align-items:center; gap:10px; background:var(--panel2); border:1px solid var(--border);
    padding:11px 14px; border-radius:11px;
  }
  .search input{background:none; border:none; outline:none; color:var(--text); font-size:13.5px; width:100%; font-family:'Inter',sans-serif;}
  .search i{color:var(--muted2);}

  table{width:100%; border-collapse:collapse; font-size:13px;}
  thead th{text-align:left; color:var(--muted); font-weight:600; font-size:11.5px; text-transform:uppercase; letter-spacing:.5px; padding:10px 14px; border-bottom:1px solid var(--border);}
  tbody td{padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.04); vertical-align:middle;}
  tbody tr:hover{background:rgba(255,255,255,.02);}
  .user-cell{display:flex; align-items:center; gap:10px;}
  .avatar{width:32px; height:32px; border-radius:9px; object-fit:cover; background:var(--panel2);}
  .u-name{font-weight:600; font-size:13px;}
  .u-id{color:var(--muted2); font-size:11px;}
  .badge{display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:100px; font-size:10.5px; font-weight:700;}
  .badge.owner{background:rgba(255,176,32,.15); color:var(--warn);}
  .badge.staff{background:rgba(124,92,255,.15); color:var(--accent);}
  .badge.bot{background:rgba(255,255,255,.06); color:var(--muted);}
  .role-chip{display:inline-block; padding:2px 8px; border-radius:100px; font-size:10.5px; font-weight:600; margin:1px; border:1px solid var(--border); background:rgba(255,255,255,.03);}
  .row-actions{display:flex; gap:6px; flex-wrap:wrap;}
  .icon-btn{
    width:30px; height:30px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); color:var(--muted);
    display:flex; align-items:center; justify-content:center; cursor:pointer; transition:.15s; font-size:12px;
  }
  .icon-btn:hover{color:#fff; transform:translateY(-1px);}
  .icon-btn.danger:hover{background:rgba(255,77,109,.18); border-color:rgba(255,77,109,.4); color:#ff8fa3;}
  .icon-btn.success:hover{background:rgba(46,230,166,.18); border-color:rgba(46,230,166,.4); color:#7cf7cf;}
  .icon-btn.warn:hover{background:rgba(255,176,32,.18); border-color:rgba(255,176,32,.4); color:#ffcf7c;}

  .empty-state{text-align:center; padding:50px 20px; color:var(--muted);}
  .empty-state i{font-size:32px; margin-bottom:12px; opacity:.5; display:block;}

  .form-grid{display:grid; grid-template-columns:1fr 1fr; gap:16px;}
  @media(max-width:720px){.form-grid{grid-template-columns:1fr;}}
  .form-group{display:flex; flex-direction:column; gap:7px;}
  .form-group label{font-size:12px; color:var(--muted); font-weight:600;}
  .form-group select, .form-group input, .form-group textarea{
    background:var(--panel2); border:1px solid var(--border); border-radius:10px; padding:11px 13px; color:var(--text);
    font-size:13px; font-family:'Inter',sans-serif; outline:none; transition:.15s;
  }
  .form-group select:focus, .form-group input:focus, .form-group textarea:focus{border-color:var(--accent);}
  .form-group textarea{resize:vertical; min-height:70px;}

  .switch-row{display:flex; align-items:center; justify-content:space-between; padding:14px 0; border-bottom:1px solid rgba(255,255,255,.05);}
  .switch-row:last-child{border-bottom:none;}
  .switch-row .lbl{font-size:13.5px; font-weight:600;}
  .switch-row .sub{font-size:11.5px; color:var(--muted); margin-top:2px;}
  .switch{position:relative; width:44px; height:24px; flex-shrink:0;}
  .switch input{opacity:0; width:0; height:0;}
  .slider-tg{position:absolute; cursor:pointer; inset:0; background:#2a2d45; border-radius:100px; transition:.2s;}
  .slider-tg:before{content:""; position:absolute; width:18px; height:18px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.2s;}
  .switch input:checked + .slider-tg{background:linear-gradient(135deg,var(--accent),var(--accent2));}
  .switch input:checked + .slider-tg:before{transform:translateX(20px);}

  .chip-list{display:flex; flex-wrap:wrap; gap:8px; margin-top:14px;}
  .chip{display:flex; align-items:center; gap:8px; background:var(--panel2); border:1px solid var(--border); padding:7px 12px; border-radius:100px; font-size:12px;}
  .chip button{background:none; border:none; color:var(--muted2); cursor:pointer; font-size:12px;}
  .chip button:hover{color:var(--danger);}
  .add-row{display:flex; gap:10px; margin-top:16px;}
  .add-row input{flex:1;}

  /* modal */
  .modal-bg{position:fixed; inset:0; background:rgba(5,6,12,.7); backdrop-filter:blur(4px); display:none; align-items:center; justify-content:center; z-index:100; padding:20px;}
  .modal-bg.show{display:flex;}
  .modal{background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); width:100%; max-width:420px; padding:26px; box-shadow:var(--shadow); animation:rise .3s ease;}
  .modal h3{font-size:17px; margin-bottom:4px;}
  .modal p.mdesc{color:var(--muted); font-size:12.5px; margin-bottom:18px;}
  .modal .form-group{margin-bottom:14px;}
  .modal-actions{display:flex; gap:10px; margin-top:6px;}
  .modal-actions .btn{flex:1;}

  .toast-wrap{position:fixed; top:20px; right:20px; z-index:200; display:flex; flex-direction:column; gap:10px;}
  .toast{
    background:var(--panel2); border:1px solid var(--border); border-left:3px solid var(--accent); padding:13px 18px; border-radius:10px;
    font-size:13px; box-shadow:var(--shadow); min-width:240px; animation:slidein .25s ease; display:flex; align-items:center; gap:10px;
  }
  .toast.success{border-left-color:var(--success);}
  .toast.error{border-left-color:var(--danger);}
  @keyframes slidein{from{opacity:0; transform:translateX(30px);} to{opacity:1; transform:translateX(0);}}

  .loader-line{height:2px; background:linear-gradient(90deg,var(--accent),var(--accent2)); width:0%; transition:width .3s; border-radius:2px;}
  @media(max-width:900px){
    .sidebar{position:fixed; left:-260px; z-index:90; transition:.25s; box-shadow:var(--shadow);}
    .sidebar.open{left:0;}
    .main{padding:20px 16px 60px;}
    .menu-toggle{display:flex !important;}
  }
  .menu-toggle{display:none; width:38px; height:38px; border-radius:10px; background:var(--panel2); border:1px solid var(--border); color:var(--text); align-items:center; justify-content:center; cursor:pointer;}
</style>
</head>
<body>

<div id="login">
  <div class="blob blob1"></div>
  <div class="blob blob2"></div>
  <div class="login-card">
    <div class="brand-logo">K</div>
    <h1>KNESTA</h1>
    <p class="sub">Yönetim Paneline Hoş Geldin</p>
    <div class="err-box" id="loginErr"></div>
    <div class="field">
      <i class="fa-solid fa-lock icon-left"></i>
      <input type="password" id="pwInput" placeholder="Panel şifresi" autocomplete="current-password">
      <i class="fa-solid fa-eye toggle-eye" id="eyeToggle"></i>
    </div>
    <button class="btn" id="loginBtn"><i class="fa-solid fa-right-to-bracket"></i> Giriş Yap</button>
    <div class="lock-badge"><i class="fa-solid fa-shield-halved"></i> Uçtan uca korumalı oturum</div>
  </div>
</div>

<div id="app">
  <div class="toast-wrap" id="toastWrap"></div>

  <div class="modal-bg" id="modalBg">
    <div class="modal" id="modalBox"></div>
  </div>

  <div class="layout">
    <div class="sidebar" id="sidebar">
      <div class="brand">
        <div class="logo">K</div>
        <div class="name">KNESTA<span>Yönetim Paneli</span></div>
      </div>
      <div class="nav">
        <div class="nav-item active" data-section="dashboard"><i class="fa-solid fa-gauge-high"></i> Dashboard</div>
        <div class="nav-item" data-section="members"><i class="fa-solid fa-users"></i> Üyeler</div>
        <div class="nav-item" data-section="bans"><i class="fa-solid fa-gavel"></i> Ban Listesi</div>
        <div class="nav-sep">Sunucu</div>
        <div class="nav-item" data-section="config"><i class="fa-solid fa-sliders"></i> Ayarlar</div>
        <div class="nav-item" data-section="guard"><i class="fa-solid fa-shield-halved"></i> Guard</div>
        <div class="nav-item" data-section="whitelist"><i class="fa-solid fa-star"></i> Whitelist</div>
        <div class="nav-item" data-section="staff"><i class="fa-solid fa-user-shield"></i> Yetkililer</div>
      </div>
      <div class="sidebar-footer">
        <button class="btn secondary" id="logoutBtn"><i class="fa-solid fa-arrow-right-from-bracket"></i> Çıkış Yap</button>
      </div>
    </div>

    <div class="main">
      <div class="topbar">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="menu-toggle" id="menuToggle"><i class="fa-solid fa-bars"></i></div>
          <div>
            <h2 id="pageTitle">Dashboard</h2>
            <div class="desc" id="pageDesc">Sunucunun genel durumu</div>
          </div>
        </div>
        <div class="pill"><span class="dot" id="statusDot"></span> <span id="statusText">Bağlanıyor...</span></div>
      </div>

      <!-- DASHBOARD -->
      <div class="section active" id="sec-dashboard">
        <div class="grid stats" id="statCards"></div>
        <div class="card" style="margin-top:18px;">
          <h3 style="font-size:14px; margin-bottom:6px;">Bot Bilgisi</h3>
          <p class="desc" id="botInfoLine" style="color:var(--muted); font-size:12.5px;">Yükleniyor...</p>
        </div>
      </div>

      <!-- MEMBERS -->
      <div class="section" id="sec-members">
        <div class="toolbar">
          <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="memberSearch" placeholder="Kullanıcı adı veya ID ile ara..."></div>
          <button class="btn secondary small" id="refreshMembers"><i class="fa-solid fa-rotate"></i> Yenile</button>
        </div>
        <div class="card" style="padding:0;">
          <table>
            <thead><tr><th>Kullanıcı</th><th>Roller</th><th>Katılım</th><th style="text-align:right;">İşlemler</th></tr></thead>
            <tbody id="membersBody"></tbody>
          </table>
          <div id="membersEmpty" class="empty-state" style="display:none;"><i class="fa-solid fa-user-slash"></i>Üye bulunamadı</div>
        </div>
      </div>

      <!-- BANS -->
      <div class="section" id="sec-bans">
        <div class="toolbar">
          <button class="btn secondary small" id="refreshBans"><i class="fa-solid fa-rotate"></i> Yenile</button>
          <button class="btn small" id="manualBanBtn" style="width:auto; background:linear-gradient(135deg,var(--danger),#ff7a5c);"><i class="fa-solid fa-gavel"></i> ID ile Banla</button>
        </div>
        <div class="card" style="padding:0;">
          <table>
            <thead><tr><th>Kullanıcı</th><th>Sebep</th><th style="text-align:right;">İşlemler</th></tr></thead>
            <tbody id="bansBody"></tbody>
          </table>
          <div id="bansEmpty" class="empty-state" style="display:none;"><i class="fa-solid fa-circle-check"></i>Banlı kullanıcı yok</div>
        </div>
      </div>

      <!-- CONFIG -->
      <div class="section" id="sec-config">
        <div class="card">
          <h3 style="font-size:15px; margin-bottom:16px;">Kanal & Rol Ayarları</h3>
          <div class="form-grid" id="configForm"></div>
          <div style="margin-top:18px; display:flex; gap:10px; flex-wrap:wrap;">
            <div class="form-group" style="flex:1; min-width:200px;">
              <label>Ticket Panel Başlığı</label>
              <input id="cfgTicketBaslik" placeholder="Örn: Knesta | Başvuru Sistemi">
            </div>
            <div class="form-group" style="flex:2; min-width:220px;">
              <label>Ticket Panel Mesajı</label>
              <textarea id="cfgTicketMesaj" placeholder="Panel açıklama metni"></textarea>
            </div>
          </div>
          <div class="switch-row" style="margin-top:6px;">
            <div><div class="lbl">Başvurular Açık</div><div class="sub">Kapatırsan kullanıcılar ticket açamaz</div></div>
            <label class="switch"><input type="checkbox" id="cfgTicketDurum"><span class="slider-tg"></span></label>
          </div>
          <button class="btn" id="saveConfigBtn" style="margin-top:18px; width:auto; padding:12px 22px;"><i class="fa-solid fa-floppy-disk"></i> Kaydet</button>
        </div>
      </div>

      <!-- GUARD -->
      <div class="section" id="sec-guard">
        <div class="card">
          <div class="switch-row">
            <div><div class="lbl">Guard Sistemi</div><div class="sub">Tüm koruma sistemlerinin ana anahtarı</div></div>
            <label class="switch"><input type="checkbox" id="guardEnabled"><span class="slider-tg"></span></label>
          </div>
          <div id="guardSystems"></div>
        </div>
        <div class="card" style="margin-top:16px;">
          <h3 style="font-size:14px; margin-bottom:14px;">Limitler</h3>
          <div class="form-grid" id="guardLimits"></div>
          <div class="form-group" style="max-width:220px; margin-top:16px;">
            <label>Zaman Aralığı (dakika)</label>
            <input type="number" id="guardWindow" min="1">
          </div>
          <button class="btn" id="saveGuardBtn" style="margin-top:18px; width:auto; padding:12px 22px;"><i class="fa-solid fa-floppy-disk"></i> Kaydet</button>
        </div>
      </div>

      <!-- WHITELIST -->
      <div class="section" id="sec-whitelist">
        <div class="card">
          <h3 style="font-size:15px;">Guard Whitelist</h3>
          <p style="color:var(--muted); font-size:12.5px; margin-top:4px;">Buradaki kullanıcılar guard limitlerinden muaftır.</p>
          <div class="add-row">
            <input id="wlInput" placeholder="Kullanıcı ID gir...">
            <button class="btn small" id="wlAddBtn" style="width:auto; padding:11px 18px;"><i class="fa-solid fa-plus"></i> Ekle</button>
          </div>
          <div class="chip-list" id="wlList"></div>
        </div>
      </div>

      <!-- STAFF -->
      <div class="section" id="sec-staff">
        <div class="card">
          <h3 style="font-size:15px;">Yetkililer</h3>
          <p style="color:var(--muted); font-size:12.5px; margin-top:4px;">Yetkili kullanıcılar staff-only komutlarını kullanabilir.</p>
          <div class="add-row">
            <input id="staffInput" placeholder="Kullanıcı ID gir...">
            <button class="btn small" id="staffAddBtn" style="width:auto; padding:11px 18px;"><i class="fa-solid fa-plus"></i> Ekle</button>
          </div>
          <div class="chip-list" id="staffList"></div>
          <h3 style="font-size:13px; margin-top:22px; color:var(--muted);">Sahipler (Owner)</h3>
          <div class="chip-list" id="ownerList"></div>
        </div>
      </div>

    </div>
  </div>
</div>

<script>
(function(){
  var pageTitles = {
    dashboard: ["Dashboard", "Sunucunun genel durumu"],
    members: ["Üyeler", "Üye yönetimi, ban / kick / rol işlemleri"],
    bans: ["Ban Listesi", "Banlı kullanıcılar ve ban kaldırma"],
    config: ["Ayarlar", "Kanal ve rol yapılandırması"],
    guard: ["Guard", "Koruma sistemi ayarları"],
    whitelist: ["Whitelist", "Guard muafiyet listesi"],
    staff: ["Yetkililer", "Yetkili kullanıcı yönetimi"]
  };
  var guildDataCache = null;

  function qs(id){ return document.getElementById(id); }

  function toast(msg, type){
    var wrap = qs("toastWrap");
    var el = document.createElement("div");
    el.className = "toast " + (type || "");
    var icon = type === "success" ? "fa-circle-check" : (type === "error" ? "fa-circle-exclamation" : "fa-circle-info");
    el.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + msg + '</span>';
    wrap.appendChild(el);
    setTimeout(function(){ el.style.opacity = "0"; el.style.transform = "translateX(30px)"; el.style.transition = ".3s"; setTimeout(function(){ el.remove(); }, 300); }, 3200);
  }

  function api(path, opts){
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (opts.body){ opts.headers["Content-Type"] = "application/json"; }
    opts.credentials = "include";
    return fetch(path, opts).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(data){
        if (!r.ok) { throw new Error(data.error || "İstek başarısız (" + r.status + ")"); }
        return data;
      });
    });
  }

  /* ---------- LOGIN ---------- */
  var pwInput = qs("pwInput");
  var loginBtn = qs("loginBtn");
  var loginErr = qs("loginErr");
  qs("eyeToggle").addEventListener("click", function(){
    var t = pwInput.type === "password" ? "text" : "password";
    pwInput.type = t;
    this.className = "fa-solid " + (t === "password" ? "fa-eye" : "fa-eye-slash") + " toggle-eye";
  });
  function doLogin(){
    var pw = pwInput.value.trim();
    if (!pw){ return; }
    loginErr.style.display = "none";
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span> Kontrol ediliyor...';
    api("/api/login", { method: "POST", body: JSON.stringify({ password: pw }) })
      .then(function(){ boot(); })
      .catch(function(e){
        loginErr.textContent = e.message;
        loginErr.style.display = "block";
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Giriş Yap';
      });
  }
  loginBtn.addEventListener("click", doLogin);
  pwInput.addEventListener("keydown", function(e){ if (e.key === "Enter") doLogin(); });

  qs("logoutBtn").addEventListener("click", function(){
    api("/api/logout", { method: "POST" }).finally(function(){ location.reload(); });
  });

  /* ---------- NAV ---------- */
  document.querySelectorAll(".nav-item").forEach(function(item){
    item.addEventListener("click", function(){
      document.querySelectorAll(".nav-item").forEach(function(n){ n.classList.remove("active"); });
      item.classList.add("active");
      var sec = item.getAttribute("data-section");
      document.querySelectorAll(".section").forEach(function(s){ s.classList.remove("active"); });
      qs("sec-" + sec).classList.add("active");
      qs("pageTitle").textContent = pageTitles[sec][0];
      qs("pageDesc").textContent = pageTitles[sec][1];
      qs("sidebar").classList.remove("open");
      loadSection(sec);
    });
  });
  qs("menuToggle").addEventListener("click", function(){ qs("sidebar").classList.toggle("open"); });

  function loadSection(sec){
    if (sec === "dashboard") loadStatus();
    if (sec === "members") loadMembers();
    if (sec === "bans") loadBans();
    if (sec === "config") loadConfig();
    if (sec === "guard") loadGuard();
    if (sec === "whitelist") loadWhitelist();
    if (sec === "staff") loadStaff();
  }

  /* ---------- MODAL ---------- */
  function openModal(html){
    qs("modalBox").innerHTML = html;
    qs("modalBg").classList.add("show");
  }
  function closeModal(){ qs("modalBg").classList.remove("show"); qs("modalBox").innerHTML = ""; }
  qs("modalBg").addEventListener("click", function(e){ if (e.target === qs("modalBg")) closeModal(); });

  function fmtMs(ms){
    if (!ms) return "Bilinmiyor";
    var s = Math.floor(ms/1000);
    var d = Math.floor(s/86400); s -= d*86400;
    var h = Math.floor(s/3600); s -= h*3600;
    var m = Math.floor(s/60);
    var parts = [];
    if (d) parts.push(d + "g");
    if (h) parts.push(h + "sa");
    if (m || (!d && !h)) parts.push(m + "dk");
    return parts.join(" ");
  }
  function fmtDate(ts){
    if (!ts) return "Bilinmiyor";
    var d = new Date(ts);
    return d.toLocaleDateString("tr-TR") + " " + d.toLocaleTimeString("tr-TR", {hour:"2-digit", minute:"2-digit"});
  }
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  /* ---------- DASHBOARD ---------- */
  function loadStatus(){
    api("/api/status").then(function(d){
      qs("statusDot").className = "dot";
      qs("statusText").textContent = d.botTag;
      qs("statCards").innerHTML =
        '<div class="card stat"><div class="icon purple"><i class="fa-solid fa-users"></i></div><div class="val">' + d.memberCount + '</div><div class="lbl">Toplam Üye</div></div>' +
        '<div class="card stat"><div class="icon cyan"><i class="fa-solid fa-tower-broadcast"></i></div><div class="val">' + d.ping + 'ms</div><div class="lbl">Bot Gecikmesi</div></div>' +
        '<div class="card stat"><div class="icon ' + (d.guardEnabled ? "green" : "orange") + '"><i class="fa-solid fa-shield-halved"></i></div><div class="val">' + (d.guardEnabled ? "Aktif" : "Kapalı") + '</div><div class="lbl">Guard Durumu</div></div>' +
        '<div class="card stat"><div class="icon orange"><i class="fa-solid fa-clock"></i></div><div class="val">' + fmtMs(d.uptimeMs) + '</div><div class="lbl">Çalışma Süresi</div></div>' +
        '<div class="card stat"><div class="icon purple"><i class="fa-solid fa-user-shield"></i></div><div class="val">' + d.staffCount + '</div><div class="lbl">Yetkili Sayısı</div></div>' +
        '<div class="card stat"><div class="icon cyan"><i class="fa-solid fa-star"></i></div><div class="val">' + d.whitelistCount + '</div><div class="lbl">Whitelist</div></div>';
      qs("botInfoLine").textContent = d.botTag + " • " + (d.guildName || "Knesta") + " sunucusunda aktif";
    }).catch(function(e){
      qs("statusDot").className = "dot off";
      qs("statusText").textContent = "Bağlantı hatası";
    });
  }

  /* ---------- MEMBERS ---------- */
  var memberSearchTimer = null;
  function loadMembers(){
    var q = qs("memberSearch").value.trim();
    api("/api/members?q=" + encodeURIComponent(q)).then(function(d){
      var body = qs("membersBody");
      if (!d.members.length){ body.innerHTML = ""; qs("membersEmpty").style.display = "block"; return; }
      qs("membersEmpty").style.display = "none";
      body.innerHTML = d.members.map(function(m){
        var badges = "";
        if (m.isOwner) badges += '<span class="badge owner">SAHİP</span> ';
        else if (m.isStaff) badges += '<span class="badge staff">YETKİLİ</span> ';
        if (m.bot) badges += '<span class="badge bot">BOT</span>';
        var roles = m.roles.slice(0,3).map(function(r){ return '<span class="role-chip" style="color:' + (r.color !== "#000000" ? r.color : "#c9cbe0") + '">' + esc(r.name) + '</span>'; }).join("");
        if (m.roles.length > 3) roles += '<span class="role-chip">+' + (m.roles.length-3) + '</span>';
        var disabled = m.isOwner ? 'style="opacity:.35; pointer-events:none;"' : "";
        return '<tr>' +
          '<td><div class="user-cell"><img class="avatar" src="' + m.avatar + '"><div><div class="u-name">' + esc(m.username) + ' ' + badges + '</div><div class="u-id">' + m.id + '</div></div></div></td>' +
          '<td>' + (roles || '<span style="color:var(--muted2); font-size:11.5px;">Rol yok</span>') + '</td>' +
          '<td style="color:var(--muted); font-size:12px;">' + fmtDate(m.joinedAt) + '</td>' +
          '<td><div class="row-actions" ' + disabled + '>' +
            '<div class="icon-btn warn" title="Zaman Aşımı" data-act="timeout" data-id="' + m.id + '" data-name="' + esc(m.username) + '"><i class="fa-solid fa-clock"></i></div>' +
            '<div class="icon-btn" title="Rol Ver/Al" data-act="role" data-id="' + m.id + '" data-name="' + esc(m.username) + '"><i class="fa-solid fa-tag"></i></div>' +
            '<div class="icon-btn danger" title="Sunucudan At" data-act="kick" data-id="' + m.id + '" data-name="' + esc(m.username) + '"><i class="fa-solid fa-user-slash"></i></div>' +
            '<div class="icon-btn danger" title="Banla" data-act="ban" data-id="' + m.id + '" data-name="' + esc(m.username) + '"><i class="fa-solid fa-gavel"></i></div>' +
          '</div></td>' +
        '</tr>';
      }).join("");
    }).catch(function(e){ toast(e.message, "error"); });
  }
  qs("memberSearch").addEventListener("input", function(){
    clearTimeout(memberSearchTimer);
    memberSearchTimer = setTimeout(loadMembers, 350);
  });
  qs("refreshMembers").addEventListener("click", loadMembers);
  qs("membersBody").addEventListener("click", function(e){
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    var id = btn.getAttribute("data-id");
    var name = btn.getAttribute("data-name");
    if (act === "timeout") __timeoutModal(id, name);
    else if (act === "role") __roleModal(id, name);
    else if (act === "kick") __kickModal(id, name);
    else if (act === "ban") __banModal(id, name);
  });

  window.__banModal = function(id, name){
    openModal(
      '<h3>Kullanıcıyı Banla</h3><p class="mdesc">' + esc(name) + ' (' + id + ') sunucudan banlanacak.</p>' +
      '<div class="form-group"><label>Sebep</label><input id="banReason" placeholder="Ban sebebi (opsiyonel)"></div>' +
      '<div class="form-group"><label>Mesaj Temizle (gün)</label><select id="banDelDays"><option value="0">Hiçbiri</option><option value="1">1 gün</option><option value="3">3 gün</option><option value="7">7 gün</option></select></div>' +
      '<div class="modal-actions"><button class="btn secondary" onclick="closeModalX()">Vazgeç</button><button class="btn danger" id="confirmBanBtn">Banla</button></div>'
    );
    qs("confirmBanBtn").addEventListener("click", function(){
      var reason = qs("banReason").value.trim();
      var days = parseInt(qs("banDelDays").value, 10) || 0;
      api("/api/members/ban", { method:"POST", body: JSON.stringify({ userId:id, reason:reason, deleteSeconds: days*86400 }) })
        .then(function(){ toast(name + " banlandı.", "success"); closeModalX(); loadMembers(); })
        .catch(function(e){ toast(e.message, "error"); });
    });
  };
  window.__kickModal = function(id, name){
    openModal(
      '<h3>Sunucudan At</h3><p class="mdesc">' + esc(name) + ' (' + id + ') sunucudan atılacak.</p>' +
      '<div class="form-group"><label>Sebep</label><input id="kickReason" placeholder="Sebep (opsiyonel)"></div>' +
      '<div class="modal-actions"><button class="btn secondary" onclick="closeModalX()">Vazgeç</button><button class="btn danger" id="confirmKickBtn">At</button></div>'
    );
    qs("confirmKickBtn").addEventListener("click", function(){
      var reason = qs("kickReason").value.trim();
      api("/api/members/kick", { method:"POST", body: JSON.stringify({ userId:id, reason:reason }) })
        .then(function(){ toast(name + " sunucudan atıldı.", "success"); closeModalX(); loadMembers(); })
        .catch(function(e){ toast(e.message, "error"); });
    });
  };
  window.__timeoutModal = function(id, name){
    openModal(
      '<h3>Zaman Aşımı Uygula</h3><p class="mdesc">' + esc(name) + ' geçici olarak susturulacak.</p>' +
      '<div class="form-group"><label>Süre (dakika)</label><input id="toMinutes" type="number" placeholder="Örn: 60"></div>' +
      '<div class="form-group"><label>Sebep</label><input id="toReason" placeholder="Sebep (opsiyonel)"></div>' +
      '<div class="modal-actions"><button class="btn secondary" onclick="closeModalX()">Vazgeç</button><button class="btn" id="confirmToBtn">Uygula</button></div>'
    );
    qs("confirmToBtn").addEventListener("click", function(){
      var minutes = parseInt(qs("toMinutes").value, 10) || 0;
      var reason = qs("toReason").value.trim();
      api("/api/members/timeout", { method:"POST", body: JSON.stringify({ userId:id, minutes:minutes, reason:reason }) })
        .then(function(){ toast(name + " için zaman aşımı uygulandı.", "success"); closeModalX(); loadMembers(); })
        .catch(function(e){ toast(e.message, "error"); });
    });
  };
  window.__roleModal = function(id, name){
    var roles = (guildDataCache && guildDataCache.roles) || [];
    var opts = roles.map(function(r){ return '<option value="' + r.id + '">' + esc(r.name) + '</option>'; }).join("");
    openModal(
      '<h3>Rol İşlemi</h3><p class="mdesc">' + esc(name) + ' için rol ekle/kaldır.</p>' +
      '<div class="form-group"><label>Rol</label><select id="roleSelect">' + opts + '</select></div>' +
      '<div class="modal-actions"><button class="btn secondary" id="roleRemoveBtn">Kaldır</button><button class="btn" id="roleAddBtn">Ekle</button></div>'
    );
    function doRole(action){
      var roleId = qs("roleSelect").value;
      api("/api/members/role", { method:"POST", body: JSON.stringify({ userId:id, roleId:roleId, action:action }) })
        .then(function(){ toast("Rol işlemi tamamlandı.", "success"); closeModalX(); loadMembers(); })
        .catch(function(e){ toast(e.message, "error"); });
    }
    qs("roleAddBtn").addEventListener("click", function(){ doRole("ekle"); });
    qs("roleRemoveBtn").addEventListener("click", function(){ doRole("kaldir"); });
  };
  window.closeModalX = closeModal;

  /* ---------- BANS ---------- */
  function loadBans(){
    api("/api/bans").then(function(d){
      var body = qs("bansBody");
      if (!d.bans.length){ body.innerHTML = ""; qs("bansEmpty").style.display = "block"; return; }
      qs("bansEmpty").style.display = "none";
      body.innerHTML = d.bans.map(function(b){
        return '<tr>' +
          '<td><div class="user-cell"><img class="avatar" src="' + b.avatar + '"><div><div class="u-name">' + esc(b.tag) + '</div><div class="u-id">' + b.id + '</div></div></div></td>' +
          '<td style="color:var(--muted); font-size:12px;">' + (esc(b.reason) || "Belirtilmemiş") + '</td>' +
          '<td style="text-align:right;"><div class="icon-btn success" title="Ban Kaldır" data-act="unban" data-id="' + b.id + '" data-name="' + esc(b.tag) + '" style="margin-left:auto;"><i class="fa-solid fa-lock-open"></i></div></td>' +
        '</tr>';
      }).join("");
    }).catch(function(e){ toast(e.message, "error"); });
  }
  qs("refreshBans").addEventListener("click", loadBans);
  qs("bansBody").addEventListener("click", function(e){
    var btn = e.target.closest("[data-act='unban']");
    if (!btn) return;
    __unbanUser(btn.getAttribute("data-id"), btn.getAttribute("data-name"));
  });
  window.__unbanUser = function(id, tag){
    if (!confirm(tag + " kullanıcısının banını kaldırmak istediğine emin misin?")) return;
    api("/api/members/unban", { method:"POST", body: JSON.stringify({ userId:id }) })
      .then(function(){ toast(tag + " için ban kaldırıldı.", "success"); loadBans(); })
      .catch(function(e){ toast(e.message, "error"); });
  };
  qs("manualBanBtn").addEventListener("click", function(){
    openModal(
      '<h3>ID ile Banla</h3><p class="mdesc">Sunucuda olmayan bir kullanıcıyı ID ile banlayabilirsin.</p>' +
      '<div class="form-group"><label>Kullanıcı ID</label><input id="manId"></div>' +
      '<div class="form-group"><label>Sebep</label><input id="manReason" placeholder="Sebep (opsiyonel)"></div>' +
      '<div class="modal-actions"><button class="btn secondary" onclick="closeModalX()">Vazgeç</button><button class="btn danger" id="manBanBtn">Banla</button></div>'
    );
    qs("manBanBtn").addEventListener("click", function(){
      var id = qs("manId").value.trim();
      var reason = qs("manReason").value.trim();
      if (!id) return;
      api("/api/members/ban", { method:"POST", body: JSON.stringify({ userId:id, reason:reason }) })
        .then(function(){ toast("Kullanıcı banlandı.", "success"); closeModalX(); loadBans(); })
        .catch(function(e){ toast(e.message, "error"); });
    });
  });

  /* ---------- CONFIG ---------- */
  function selectHtml(id, label, options, current){
    var opts = '<option value="">— Seçilmedi —</option>' + options.map(function(o){
      return '<option value="' + o.id + '"' + (o.id === current ? " selected" : "") + '>' + esc(o.name) + '</option>';
    }).join("");
    return '<div class="form-group"><label>' + label + '</label><select id="' + id + '">' + opts + '</select></div>';
  }
  function loadConfig(){
    Promise.all([api("/api/config"), api("/api/guild-data")]).then(function(res){
      var cfg = res[0], gd = res[1];
      guildDataCache = gd;
      qs("configForm").innerHTML =
        selectHtml("cfgLogChannel", "Log Kanalı", gd.channels, cfg.logChannelId) +
        selectHtml("cfgTicketCategory", "Ticket Kategorisi", gd.categories, cfg.ticketCategoryId) +
        selectHtml("cfgTicketStaffRole", "Ticket Yetkili Rolü", gd.roles, cfg.ticketStaffRoleId) +
        selectHtml("cfgEkipRole", "Ekip Rolü", gd.roles, cfg.ekipRoleId) +
        selectHtml("cfgNewRole", "Yeni Üye Rolü", gd.roles, cfg.newRoleId) +
        selectHtml("cfgAktiflikLog", "Aktiflik Log Kanalı", gd.channels, cfg.aktiflikLogChannelId);
      qs("cfgTicketBaslik").value = cfg.ticketPanelBaslik || "";
      qs("cfgTicketMesaj").value = cfg.ticketPanelMesaji || "";
      qs("cfgTicketDurum").checked = cfg.ticketDurum === "acik";
    }).catch(function(e){ toast(e.message, "error"); });
  }
  qs("saveConfigBtn").addEventListener("click", function(){
    var body = {
      logChannelId: qs("cfgLogChannel").value,
      ticketCategoryId: qs("cfgTicketCategory").value,
      ticketStaffRoleId: qs("cfgTicketStaffRole").value,
      ekipRoleId: qs("cfgEkipRole").value,
      newRoleId: qs("cfgNewRole").value,
      aktiflikLogChannelId: qs("cfgAktiflikLog").value,
      ticketPanelBaslik: qs("cfgTicketBaslik").value,
      ticketPanelMesaji: qs("cfgTicketMesaj").value,
      ticketDurum: qs("cfgTicketDurum").checked ? "acik" : "kapali"
    };
    api("/api/config", { method:"POST", body: JSON.stringify(body) })
      .then(function(){ toast("Ayarlar kaydedildi.", "success"); })
      .catch(function(e){ toast(e.message, "error"); });
  });

  /* ---------- GUARD ---------- */
  var guardLabels = { ban:"Ban Guard", kick:"Kick Guard", channel:"Kanal Guard", role:"Rol Guard" };
  function loadGuard(){
    api("/api/guard").then(function(g){
      qs("guardEnabled").checked = !!g.enabled;
      var sysHtml = "";
      Object.keys(guardLabels).forEach(function(k){
        sysHtml += '<div class="switch-row"><div><div class="lbl">' + guardLabels[k] + '</div></div>' +
          '<label class="switch"><input type="checkbox" class="guard-sys" data-key="' + k + '" ' + (g.systems[k] ? "checked" : "") + '><span class="slider-tg"></span></label></div>';
      });
      qs("guardSystems").innerHTML = sysHtml;
      var limHtml = "";
      Object.keys(guardLabels).forEach(function(k){
        limHtml += '<div class="form-group"><label>' + guardLabels[k] + ' Limiti</label><input type="number" class="guard-lim" data-key="' + k + '" value="' + g.limits[k] + '" min="0"></div>';
      });
      qs("guardLimits").innerHTML = limHtml;
      qs("guardWindow").value = g.windowMinutes;
    }).catch(function(e){ toast(e.message, "error"); });
  }
  qs("saveGuardBtn").addEventListener("click", function(){
    var systems = {}; document.querySelectorAll(".guard-sys").forEach(function(el){ systems[el.getAttribute("data-key")] = el.checked; });
    var limits = {}; document.querySelectorAll(".guard-lim").forEach(function(el){ limits[el.getAttribute("data-key")] = parseInt(el.value, 10) || 0; });
    var body = { enabled: qs("guardEnabled").checked, systems: systems, limits: limits, windowMinutes: parseInt(qs("guardWindow").value, 10) || 10 };
    api("/api/guard", { method:"POST", body: JSON.stringify(body) })
      .then(function(){ toast("Guard ayarları kaydedildi.", "success"); })
      .catch(function(e){ toast(e.message, "error"); });
  });

  /* ---------- WHITELIST ---------- */
  function loadWhitelist(){
    api("/api/whitelist").then(function(d){
      qs("wlList").innerHTML = d.whitelist.length ? d.whitelist.map(function(id){
        return '<div class="chip"><span>' + id + '</span><button data-act="wl-remove" data-id="' + id + '"><i class="fa-solid fa-xmark"></i></button></div>';
      }).join("") : '<span style="color:var(--muted2); font-size:12.5px;">Whitelist boş</span>';
    }).catch(function(e){ toast(e.message, "error"); });
  }
  qs("wlList").addEventListener("click", function(e){
    var btn = e.target.closest("[data-act='wl-remove']");
    if (!btn) return;
    __wlRemove(btn.getAttribute("data-id"));
  });
  qs("wlAddBtn").addEventListener("click", function(){
    var id = qs("wlInput").value.trim();
    if (!id) return;
    api("/api/whitelist", { method:"POST", body: JSON.stringify({ userId:id, action:"ekle" }) })
      .then(function(){ qs("wlInput").value = ""; toast("Whitelist'e eklendi.", "success"); loadWhitelist(); })
      .catch(function(e){ toast(e.message, "error"); });
  });
  window.__wlRemove = function(id){
    api("/api/whitelist", { method:"POST", body: JSON.stringify({ userId:id, action:"kaldir" }) })
      .then(function(){ toast("Whitelist'ten çıkarıldı.", "success"); loadWhitelist(); })
      .catch(function(e){ toast(e.message, "error"); });
  };

  /* ---------- STAFF ---------- */
  function loadStaff(){
    api("/api/staff").then(function(d){
      qs("staffList").innerHTML = d.staff.length ? d.staff.map(function(id){
        return '<div class="chip"><span>' + id + '</span><button data-act="staff-remove" data-id="' + id + '"><i class="fa-solid fa-xmark"></i></button></div>';
      }).join("") : '<span style="color:var(--muted2); font-size:12.5px;">Yetkili listesi boş</span>';
      qs("ownerList").innerHTML = d.owners.map(function(id){ return '<div class="chip"><i class="fa-solid fa-crown" style="color:var(--warn);"></i>&nbsp;' + id + '</div>'; }).join("");
    }).catch(function(e){ toast(e.message, "error"); });
  }
  qs("staffList").addEventListener("click", function(e){
    var btn = e.target.closest("[data-act='staff-remove']");
    if (!btn) return;
    __staffRemove(btn.getAttribute("data-id"));
  });
  qs("staffAddBtn").addEventListener("click", function(){
    var id = qs("staffInput").value.trim();
    if (!id) return;
    api("/api/staff", { method:"POST", body: JSON.stringify({ userId:id, action:"ekle" }) })
      .then(function(){ qs("staffInput").value = ""; toast("Yetkili eklendi.", "success"); loadStaff(); })
      .catch(function(e){ toast(e.message, "error"); });
  });
  window.__staffRemove = function(id){
    api("/api/staff", { method:"POST", body: JSON.stringify({ userId:id, action:"kaldir" }) })
      .then(function(){ toast("Yetkili kaldırıldı.", "success"); loadStaff(); })
      .catch(function(e){ toast(e.message, "error"); });
  };

  /* ---------- BOOT ---------- */
  function boot(){
    qs("login").style.display = "none";
    qs("app").style.display = "block";
    loadStatus();
    api("/api/guild-data").then(function(gd){ guildDataCache = gd; }).catch(function(){});
    setInterval(loadStatus, 15000);
  }

  api("/api/status").then(function(){ boot(); }).catch(function(){});
})();
</script>
</body>
</html>`;

const panelSessions = new Map(); // token -> { expires }
const loginAttempts = new Map(); // ip -> { count, resetAt }

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length) {
    try { crypto.timingSafeEqual(bufA, bufA); } catch {}
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  panelSessions.set(token, { expires: Date.now() + 12 * 60 * 60 * 1000 });
  return token;
}
function isValidSession(token) {
  if (!token) return false;
  const s = panelSessions.get(token);
  if (!s) return false;
  if (Date.now() > s.expires) { panelSessions.delete(token); return false; }
  return true;
}
function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  const found = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}
function getClientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

app.use(express.json());

function requirePanelAuth(req, res, next) {
  const token = getCookie(req, "knesta_session");
  if (!isValidSession(token)) return res.status(401).json({ error: "Oturum geçersiz, tekrar giriş yap." });
  next();
}

// ---- Giriş / Çıkış ----
app.post("/api/login", (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.count >= 6 && now < attempt.resetAt) {
    const waitMin = Math.max(1, Math.ceil((attempt.resetAt - now) / 60000));
    return res.status(429).json({ error: `Çok fazla yanlış deneme. ${waitMin} dakika sonra tekrar dene.` });
  }
  const { password } = req.body || {};
  if (!password || !safeCompare(password, PANEL_PASSWORD)) {
    const a = attempt || { count: 0, resetAt: now + 10 * 60 * 1000 };
    a.count += 1;
    if (a.count === 1) a.resetAt = now + 10 * 60 * 1000;
    loginAttempts.set(ip, a);
    return res.status(401).json({ error: "Şifre yanlış." });
  }
  loginAttempts.delete(ip);
  const token = createSession();
  res.setHeader("Set-Cookie", `knesta_session=${token}; HttpOnly; Path=/; Max-Age=43200; SameSite=Strict`);
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  const token = getCookie(req, "knesta_session");
  panelSessions.delete(token);
  res.setHeader("Set-Cookie", "knesta_session=; Path=/; Max-Age=0");
  res.json({ ok: true });
});

// ---- Bot / Sunucu Durumu ----
app.get("/api/status", requirePanelAuth, (req, res) => {
  const guild = client.guilds.cache.first();
  res.json({
    botTag: client.user?.tag || "Bağlanıyor...",
    botAvatar: client.user?.displayAvatarURL?.({ size: 128 }) || "",
    guildName: guild?.name || GUILD_NAME_LABEL,
    guildIcon: guild?.iconURL?.({ size: 128 }) || "",
    guildCount: client.guilds.cache.size,
    memberCount: guild ? guild.memberCount : 0,
    onlinePresenceCount: guild ? guild.members.cache.filter((m) => m.presence && m.presence.status !== "offline").size : 0,
    ping: client.ws.ping,
    uptimeMs: client.uptime || 0,
    guardEnabled: !!guardConfig?.enabled,
    staffCount: staffIds ? staffIds.size : 0,
    whitelistCount: whitelist ? whitelist.size : 0
  });
});

// ---- Sunucudaki kanal/kategori/rol listesi ----
app.get("/api/guild-data", requirePanelAuth, (req, res) => {
  const guild = client.guilds.cache.first();
  if (!guild) return res.json({ channels: [], categories: [], roles: [] });
  res.json({
    channels: guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).map((c) => ({ id: c.id, name: c.name })),
    categories: guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).map((c) => ({ id: c.id, name: c.name })),
    roles: guild.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name, color: r.hexColor }))
  });
});

// ---- Genel Config ----
app.get("/api/config", requirePanelAuth, (req, res) => {
  res.json({
    logChannelId: config.logChannelId,
    ticketCategoryId: config.ticketCategoryId,
    ticketStaffRoleId: config.ticketStaffRoleId,
    ekipRoleId: config.ekipRoleId,
    newRoleId: config.newRoleId,
    aktiflikLogChannelId: config.aktiflikLogChannelId,
    ticketDurum: config.ticketDurum || "acik",
    ticketPanelBaslik: config.ticketPanelBaslik || "",
    ticketPanelMesaji: config.ticketPanelMesaji || ""
  });
});
app.post("/api/config", requirePanelAuth, (req, res) => {
  const b = req.body || {};
  const idFields = ["logChannelId", "ticketCategoryId", "ticketStaffRoleId", "ekipRoleId", "newRoleId", "aktiflikLogChannelId"];
  for (const f of idFields) {
    if (typeof b[f] === "string") config[f] = b[f].trim() || null;
  }
  if (typeof b.ticketDurum === "string" && ["acik", "kapali"].includes(b.ticketDurum)) config.ticketDurum = b.ticketDurum;
  if (typeof b.ticketPanelBaslik === "string") config.ticketPanelBaslik = b.ticketPanelBaslik.trim();
  if (typeof b.ticketPanelMesaji === "string") config.ticketPanelMesaji = b.ticketPanelMesaji.trim();
  aktiflikLogChannelId = config.aktiflikLogChannelId || null;
  saveConfig();
  const guild = client.guilds.cache.first();
  if (guild) refreshTicketPanelMessage(guild).catch(() => {});
  res.json({ ok: true });
});

// ---- Guard ayarları ----
app.get("/api/guard", requirePanelAuth, (req, res) => res.json(guardConfig));
app.post("/api/guard", requirePanelAuth, (req, res) => {
  const b = req.body || {};
  if (typeof b.enabled === "boolean") guardConfig.enabled = b.enabled;
  if (b.systems) for (const k of ["ban", "kick", "channel", "role"]) {
    if (typeof b.systems[k] === "boolean") guardConfig.systems[k] = b.systems[k];
  }
  if (b.limits) for (const k of ["ban", "kick", "channel", "role"]) {
    const n = parseInt(b.limits[k], 10);
    if (!Number.isNaN(n) && n >= 0) guardConfig.limits[k] = n;
  }
  if (b.windowMinutes) {
    const n = parseInt(b.windowMinutes, 10);
    if (!Number.isNaN(n) && n > 0) guardConfig.windowMinutes = n;
  }
  saveGuard();
  res.json({ ok: true, guardConfig });
});

// ---- Whitelist (guard'dan muaf kişiler) ----
app.get("/api/whitelist", requirePanelAuth, (req, res) => {
  res.json({ whitelist: Array.from(whitelist) });
});
app.post("/api/whitelist", requirePanelAuth, (req, res) => {
  const { userId, action } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId gerekli" });
  if (action === "ekle") whitelist.add(userId.trim());
  else if (action === "kaldir") whitelist.delete(userId.trim());
  else return res.status(400).json({ error: "Geçersiz işlem" });
  saveWhitelist();
  res.json({ ok: true, whitelist: Array.from(whitelist) });
});

// ---- Yetkililer ----
app.get("/api/staff", requirePanelAuth, (req, res) => {
  res.json({ staff: Array.from(staffIds), owners: OWNER_IDS });
});
app.post("/api/staff", requirePanelAuth, (req, res) => {
  const { userId, action } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId gerekli" });
  if (action === "ekle") staffIds.add(userId.trim());
  else if (action === "kaldir") staffIds.delete(userId.trim());
  else return res.status(400).json({ error: "Geçersiz işlem" });
  saveStaff();
  res.json({ ok: true, staff: Array.from(staffIds) });
});

// ---- Üyeler ----
app.get("/api/members", requirePanelAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return res.json({ members: [], total: 0 });
    const q = (req.query.q || "").toString().toLowerCase().trim();
    const list = await guild.members.fetch();
    let arr = Array.from(list.values()).map((m) => ({
      id: m.id,
      tag: m.user.tag,
      username: m.user.username,
      avatar: m.user.displayAvatarURL({ size: 64 }),
      bot: m.user.bot,
      joinedAt: m.joinedTimestamp || 0,
      roles: m.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
      isOwner: isOwner(m.id),
      isStaff: isStaff(m.id)
    }));
    if (q) arr = arr.filter((m) => m.tag.toLowerCase().includes(q) || m.id.includes(q) || m.username.toLowerCase().includes(q));
    arr.sort((a, b) => a.username.localeCompare(b.username));
    res.json({ members: arr.slice(0, 250), total: arr.length });
  } catch (e) {
    res.status(500).json({ error: e.message || "Üye listesi alınamadı" });
  }
});

// ---- Ban Listesi ----
app.get("/api/bans", requirePanelAuth, async (req, res) => {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return res.json({ bans: [] });
    const bans = await guild.bans.fetch();
    const arr = Array.from(bans.values()).map((b) => ({
      id: b.user.id,
      tag: b.user.tag,
      avatar: b.user.displayAvatarURL({ size: 64 }),
      reason: b.reason || ""
    }));
    res.json({ bans: arr });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ban listesi alınamadı" });
  }
});

// ---- Ban / Kick / Unban / Timeout / Rol işlemleri ----
app.post("/api/members/ban", requirePanelAuth, async (req, res) => {
  try {
    const { userId, reason, deleteSeconds } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId gerekli" });
    if (isOwner(userId)) return res.status(403).json({ error: "Bu kullanıcı banlanamaz." });
    const guild = client.guilds.cache.first();
    if (!guild) return res.status(500).json({ error: "Sunucu bulunamadı" });
    const secs = Math.min(Math.max(parseInt(deleteSeconds, 10) || 0, 0), 604800);
    await guild.members.ban(userId.trim(), { reason: (reason || "Panel üzerinden banlandı").slice(0, 400), deleteMessageSeconds: secs });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ban işlemi başarısız" });
  }
});
app.post("/api/members/unban", requirePanelAuth, async (req, res) => {
  try {
    const { userId, reason } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId gerekli" });
    const guild = client.guilds.cache.first();
    if (!guild) return res.status(500).json({ error: "Sunucu bulunamadı" });
    await guild.members.unban(userId.trim(), (reason || "Panel üzerinden ban kaldırıldı").slice(0, 400));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Ban kaldırma başarısız (kullanıcı zaten banlı değil olabilir)" });
  }
});
app.post("/api/members/kick", requirePanelAuth, async (req, res) => {
  try {
    const { userId, reason } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId gerekli" });
    if (isOwner(userId)) return res.status(403).json({ error: "Bu kullanıcı sunucudan atılamaz." });
    const guild = client.guilds.cache.first();
    if (!guild) return res.status(500).json({ error: "Sunucu bulunamadı" });
    const member = await guild.members.fetch(userId.trim()).catch(() => null);
    if (!member) return res.status(404).json({ error: "Üye sunucuda bulunamadı" });
    await member.kick((reason || "Panel üzerinden atıldı").slice(0, 400));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Kick işlemi başarısız" });
  }
});
app.post("/api/members/timeout", requirePanelAuth, async (req, res) => {
  try {
    const { userId, minutes, reason } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId gerekli" });
    if (isOwner(userId)) return res.status(403).json({ error: "Bu kullanıcıya zaman aşımı verilemez." });
    const guild = client.guilds.cache.first();
    if (!guild) return res.status(500).json({ error: "Sunucu bulunamadı" });
    const member = await guild.members.fetch(userId.trim()).catch(() => null);
    if (!member) return res.status(404).json({ error: "Üye sunucuda bulunamadı" });
    const n = parseInt(minutes, 10);
    const ms = n > 0 ? Math.min(n, 40320) * 60 * 1000 : null;
    await member.timeout(ms, (reason || "Panel üzerinden susturuldu").slice(0, 400));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Zaman aşımı işlemi başarısız" });
  }
});
app.post("/api/members/role", requirePanelAuth, async (req, res) => {
  try {
    const { userId, roleId, action } = req.body || {};
    if (!userId || !roleId) return res.status(400).json({ error: "Eksik veri" });
    const guild = client.guilds.cache.first();
    if (!guild) return res.status(500).json({ error: "Sunucu bulunamadı" });
    const member = await guild.members.fetch(userId.trim()).catch(() => null);
    if (!member) return res.status(404).json({ error: "Üye sunucuda bulunamadı" });
    if (action === "ekle") await member.roles.add(roleId);
    else if (action === "kaldir") await member.roles.remove(roleId);
    else return res.status(400).json({ error: "Geçersiz işlem" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "Rol işlemi başarısız" });
  }
});

// ---- Panel sayfası ----
app.get("/panel", (req, res) => res.status(200).send(PANEL_HTML));

// ===================== BOOTSTRAP =====================
(async () => {
  await initMongo();
  await pullFromMongo("config.json", CONFIG_FILE);
  await pullFromMongo("guard.json", GUARD_FILE);
  await pullFromMongo("whitelist.json", WHITELIST_FILE);
  await pullFromMongo("staff.json", STAFF_FILE);

  config = loadJSON(CONFIG_FILE, {
    logChannelId: null,
    ticketCategoryId: null,
    ticketStaffRoleId: null,
    ekipRoleId: null,
    newRoleId: null,
    ticketDurum: "acik",
    ticketPanelChannelId: null,
    ticketPanelMessageId: null,
    ticketPanelBaslik: null,
    ticketPanelMesaji: null,
    aktiflikLogChannelId: null,
    logs: {}
  });
  aktiflikLogChannelId = config.aktiflikLogChannelId || null;
  guardConfig = loadJSON(GUARD_FILE, {
    enabled: true,
    systems: { ban: true, kick: true, channel: true, role: true },
    limits: { ban: 2, kick: 3, channel: 1, role: 2 },
    windowMinutes: 10
  });
  whitelist = new Set(loadJSON(WHITELIST_FILE, []));
  staffIds = new Set(loadJSON(STAFF_FILE, ENV_STAFF_IDS));

  if (CLIENT_ID) await registerCommands();
  else console.warn("⚠️ CLIENT_ID tanımlı değil, slash komutlar kaydedilmedi.");

  await client.login(TOKEN);
})();
