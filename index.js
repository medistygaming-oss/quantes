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
