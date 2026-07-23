// ===================== INGAME + SES YASAK SYSTEM (SLASH ONLY) =====================
// discord.js v14 | Slash Commands: /ingame-olustur , /ingame-iptal , /ses-yasak
// Butonlar: Katıl, Ayrıl, Bilgi, İptal Et, Kontrol (FiveM discord id sorgusu)
// Limit dolunca sonraki katılanlar "Yedek" listesine yazılır
// Ses Yasak: etiketlenen kanala önceden bulunanlar dışında giriş yasak,
// giren anında disconnect, aynı kişi 3. kez denerse 60sn timeout
// ========================================================================

process.on("unhandledRejection", (r) => console.error("UNHANDLED_REJECTION:", r));
process.on("uncaughtException", (e) => console.error("UNCAUGHT_EXCEPTION:", e));

const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  SlashCommandBuilder,
  Routes,
  REST
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

// ===================== ENV / TOKEN =====================
const TOKEN = (
  process.env.DISCORD_BOT_TOKEN ||
  process.env.DISCORD_TOKEN ||
  process.env.TOKEN ||
  ""
).trim();

if (!TOKEN) {
  console.error("❌ DISCORD_BOT_TOKEN eksik!");
  process.exit(1);
}

const CLIENT_ID = (process.env.CLIENT_ID || "").trim(); // slash komut register için gerekli

// ===================== Render Keep-Alive =====================
const app = express();
app.get("/", (req, res) => res.status(200).send("OK"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log("🌐 Web aktif:", PORT));

// ===================== AYARLAR =====================
const OWNER_IDS = ["827905938923978823", "1129811807570247761"];
const isOwner = (id) => OWNER_IDS.includes(id);

const STAFF_IDS = new Set(
  (process.env.STAFF_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
);
if (STAFF_IDS.size === 0) {
  [
    "1129811807570247761"

  ].forEach((id) => STAFF_IDS.add(id));
}
const isStaff = (id) => isOwner(id) || STAFF_IDS.has(id);

const NAVY = 0x0b1a3a;
const CFX_CODE = (process.env.CFX_CODE || "xjx5kr").trim(); // https://servers-frontend.fivem.net/api/servers/single/xjx5kr

// ===================== EMOJİLER (SENİN ÖZEL SET) =====================
const EMOJI = {
  settings: "<a:settings:1520165591267414016>",
  success: "<a:success:1520165977227137075>",
  info: "<:info:1520167364379938896>",
  lock: "<a:lock_key:1520167477030686820>",
  right: "<a:sagok:1520167724355948744>",
  star: "<:yildiz:1520167832678301890>",
  warn: "<a:uyari1:1520167965343879328>",

  ban: "<:ban:1520168371096649728>",
  kick: "<:ban:1520168371096649728>",
  trash: "<:trash:1520169243314753547>",
  shield: "<:shield:1520169561683394761>",

  weed: "<:weed:1520169653358428351>",
  box: "<:box:1520169843452543169>",
  crown: "<a:crown:1520169978609799258>",
  refresh: "<:refresh:1520170092975882260>",

  headphones: "<:headphones:1520170199368601710>",
  muted: "<:muted:1520170268524281866>",
  unmute: "<:unmute:1520170332659646564>",
  move: "<a:sagok:1520167724355948744>",

  search: "<:search:1520171230009753770>",
  fivem: "<:fivem:1520171196518240546>"
};

const line = (emoji, text) => `${emoji} ・ ${text}`;

// ===================== EMBED HELPER =====================
function createEmbed(guild, { title, description, fields, image }) {
  const e = new EmbedBuilder().setColor(NAVY).setTimestamp();
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (fields?.length) e.addFields(fields);
  if (image) e.setImage(image);
  return e;
}
async function replyE(interaction, embed, ephemeral = false) {
  const payload = { embeds: [embed] };
  if (ephemeral) payload.flags = 64;
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload).catch(() => {});
  }
  return interaction.reply(payload).catch(() => {});
}

// ===================== SÜRE PARSE =====================
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

// ===================== FiveM CACHE =====================
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await _fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let lastPlayersFetchAt = 0;
let cachedPlayersJson = null;

async function getServerPlayersCached() {
  const now = Date.now();
  if (cachedPlayersJson && now - lastPlayersFetchAt < 15000) {
    return cachedPlayersJson;
  }
  const url = `https://servers-frontend.fivem.net/api/servers/single/${CFX_CODE}`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  cachedPlayersJson = json;
  lastPlayersFetchAt = now;
  return json;
}

// Sunucudaki oyuncuların identifiers listesinden discordId -> {name, id, ping} haritası çıkarır
function buildDiscordIdIndex(json) {
  const players = json?.Data?.players || [];
  const map = new Map();
  for (const p of players) {
    const ids = Array.isArray(p.identifiers) ? p.identifiers : [];
    const discordId = ids.find((x) => x.startsWith("discord:"))?.replace("discord:", "");
    if (discordId) map.set(discordId, { name: p.name, id: p.id, ping: p.ping });
  }
  return map;
}

// ===================== STATE: INGAME =====================
// messageId -> { title, limit, users: [], yedek: [], durationMs, endsAt, timer, closed, channelId, guildId }
const ingameList = new Map();

// ===================== STATE: SES YASAK =====================
// channelId -> { allowedIds: Set<userId>, guildId }
const voiceLocks = new Map();
// `${channelId}:${userId}` -> attempt count (kilitli kanala izinsiz giriş denemesi)
const lockAttempts = new Map();

// ===================== UI HELPERS: INGAME =====================
function ingameRows(closed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ingame_join")
      .setLabel("Katıl")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
      .setDisabled(!!closed),
    new ButtonBuilder()
      .setCustomId("ingame_leave")
      .setLabel("Ayrıl")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🚪")
      .setDisabled(!!closed),
    new ButtonBuilder()
      .setCustomId("ingame_info")
      .setLabel("Bilgi")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("ℹ️"),
    new ButtonBuilder()
      .setCustomId("ingame_cancel")
      .setLabel("İPTAL ET")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔴")
      .setDisabled(!!closed),
    new ButtonBuilder()
      .setCustomId("ingame_kontrol")
      .setLabel("Kontrol")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔎")
  );
}

function ingameEmbed(guild, data) {
  const mainList = data.users.length
    ? data.users.map((id, idx) => `**${idx + 1}.** <@${id}> \`${id}\``).join("\n")
    : line(EMOJI.warn, "Henüz katılan yok.");

  const yedekList = data.yedek.length
    ? data.yedek.map((id, idx) => `**${idx + 1}.** <@${id}> \`${id}\``).join("\n")
    : line(EMOJI.info, "Yedek yok.");

  const remaining = data.endsAt ? data.endsAt - Date.now() : null;

  return createEmbed(guild, {
    title: `${EMOJI.star} ・ ${data.title}`,
    description:
      `\`[ MAIN KADRO: ${data.users.length} / ${data.limit} ]\`\n\n` +
      `${line(EMOJI.info, `**Süre:** ${data.closed ? "Kapandı" : (remaining !== null ? formatRemaining(remaining) : "Belirsiz")}`)}\n\n` +
      `${line(EMOJI.right, "**Katılımcılar (Ana Kadro)**")}\n${mainList}\n\n` +
      `${line(EMOJI.right, `**Yedek Liste (${data.yedek.length})**`)}\n${yedekList}`
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
          description:
            `${line(EMOJI.info, `**${data.title}** için alımlar kapanmıştır.`)}\n` +
            `${line(EMOJI.right, `Sebep: **${reason}**`)}`
        })
      ]
    }).catch(() => {});
  }
}

// ===================== CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel]
});

// ===================== SLASH COMMANDS =====================
const commands = [
  new SlashCommandBuilder()
    .setName("ingame-olustur")
    .setDescription("Yeni bir ingame katılım paneli oluşturur.")
    .addStringOption((opt) =>
      opt.setName("sure").setDescription("Süre (örn: 2sa, 30dk, 1g 2sa)").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("limit").setDescription("Maksimum ana kadro kişi sayısı").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("isim").setDescription("Etkinlik ismi").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("ingame-iptal")
    .setDescription("Bir ingame panelini iptal eder.")
    .addStringOption((opt) =>
      opt
        .setName("mesaj_id")
        .setDescription("İptal edilecek panelin mesaj ID'si (boş bırakılırsa bu kanaldaki en son panel)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("ses-yasak")
    .setDescription("Etiketlenen ses kanalını kilitler (tekrar çalıştırınca kilit kalkar).")
    .addChannelOption((opt) =>
      opt
        .setName("kanal")
        .setDescription("Kilitlenecek/kilidi açılacak ses kanalı")
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    )
].map((c) => c.toJSON());

async function registerCommands() {
  if (!CLIENT_ID) {
    console.error("⚠️ CLIENT_ID env eksik, slash komutlar register edilemedi.");
    return;
  }
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Slash komutlar register edildi.");
  } catch (e) {
    console.error("❌ Slash komut register hatası:", e);
  }
}

client.once("ready", async () => {
  console.log(`🟢 Bot aktif: ${client.user.tag}`);
  await registerCommands();
});

// ===================== VOICE STATE UPDATE: SES YASAK KONTROLÜ =====================
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const member = newState.member;
    if (!member) return;

    // Yeni bir kanala giriş yaptıysa kontrol et (kanal değişimi de dahil)
    const joinedChannelId = newState.channelId;
    if (!joinedChannelId) return;
    if (oldState.channelId === joinedChannelId) return; // aynı kanaldaysa (mute/deaf vs.) dokunma

    const lock = voiceLocks.get(joinedChannelId);
    if (!lock) return;

    // Owner / staff kilide takılmaz
    if (isOwner(member.id) || isStaff(member.id)) return;

    // Kilitlenme anında bu kanalda zaten olan kişi serbest
    if (lock.allowedIds.has(member.id)) return;

    // İzinsiz giriş -> anında at
    await member.voice.disconnect("Ses Yasak: Bu kanala giriş izniniz yok").catch(() => {});

    const attemptKey = `${joinedChannelId}:${member.id}`;
    const attempts = (lockAttempts.get(attemptKey) || 0) + 1;
    lockAttempts.set(attemptKey, attempts);

    const guild = newState.guild;
    const channel = guild.channels.cache.get(joinedChannelId);

    if (attempts >= 3) {
      // 3. denemede 60 saniye timeout
      await member.timeout(60 * 1000, "Ses Yasak: Kilitli kanala 3 kez giriş denemesi").catch(() => {});
      lockAttempts.delete(attemptKey);

      if (channel) {
        channel.send({
          embeds: [createEmbed(guild, {
            title: line(EMOJI.lock, "ꜱᴇꜱ ʏᴀꜱᴀᴋ • ᴛɪᴍᴇᴏᴜᴛ"),
            description:
              `${line(EMOJI.warn, `${member} kilitli kanala **3. kez** girmeye çalıştı.`)}\n` +
              `${line(EMOJI.right, "60 saniye timeout uygulandı.")}`
          })]
        }).catch(() => {});
      }
    } else if (channel) {
      channel.send({
        embeds: [createEmbed(guild, {
          title: line(EMOJI.warn, "ꜱᴇꜱ ʏᴀꜱᴀᴋ"),
          description:
            `${line(EMOJI.warn, `${member} bu kanala giriş izni olmadığı için atıldı.`)}\n` +
            `${line(EMOJI.info, `Deneme: **${attempts}/3**`)}`
        })]
      }).catch(() => {});
    }
  } catch (err) {
    console.error("SES YASAK HATA:", err);
  }
});

// ===================== INTERACTIONS =====================
client.on("interactionCreate", async (i) => {
  try {
    if (!i.guild) return;
    const guild = i.guild;

    // ===================== SLASH: /ingame-olustur =====================
    if (i.isChatInputCommand() && i.commandName === "ingame-olustur") {
      if (!isStaff(i.user.id)) {
        return replyE(i, createEmbed(guild, {
          title: line(EMOJI.lock, "ʏᴇᴛᴋɪ ʏᴏᴋ"),
          description: line(EMOJI.warn, "Sadece yetkililer.")
        }), true);
      }

      const durationText = i.options.getString("sure", true);
      const limit = i.options.getInteger("limit", true);
      const titleText = i.options.getString("isim", true).trim();

      const durationMs = parseDurationToMs(durationText);
      if (!durationMs || durationMs <= 0) {
        return replyE(i, createEmbed(guild, {
          title: line(EMOJI.warn, "ɢᴇᴄᴇʀꜱɪᴢ ꜱᴜ̈ʀᴇ"),
          description: line(EMOJI.info, "Süre örnekleri: `30dk`, `2sa`, `1g 2sa`, `90` (dakika)")
        }), true);
      }
      if (!limit || limit < 1) {
        return replyE(i, createEmbed(guild, {
          title: line(EMOJI.warn, "ɢᴇᴄᴇʀꜱɪᴢ ᴋᴏɴᴛᴇɴᴊᴀɴ"),
          description: line(EMOJI.info, "Max kişi sayısını geçerli bir sayı olarak gir.")
        }), true);
      }
      if (!titleText) {
        return replyE(i, createEmbed(guild, {
          title: line(EMOJI.warn, "ʜᴀᴛᴀ"),
          description: line(EMOJI.info, "Etkinlik ismini gir.")
        }), true);
      }

      await i.deferReply({ flags: 64 });

      const endsAt = Date.now() + durationMs;
      const data = {
        title: titleText,
        limit,
        users: [],
        yedek: [],
        durationMs,
        endsAt,
        closed: false,
        timer: null,
        channelId: i.channel.id,
        guildId: guild.id
      };

      const msg = await i.channel.send({
        embeds: [ingameEmbed(guild, data)],
        components: [ingameRows(false)]
      });

      ingameList.set(msg.id, data);

      data.timer = setTimeout(() => {
        closeIngame(guild, msg.id, "Süre doldu").catch(() => {});
      }, durationMs);

      return i.editReply({
        embeds: [
          createEmbed(guild, {
            title: line(EMOJI.success, "ᴘᴀɴᴇʟ ᴋᴜʀᴜʟᴅᴜ"),
            description:
              `${line(EMOJI.star, `**${titleText}**`)}\n` +
              `${line(EMOJI.right, `Kontenjan: **${limit}**`)}\n` +
              `${line(EMOJI.right, `Süre: **${formatRemaining(durationMs)}**`)}\n` +
              `${line(EMOJI.info, `Mesaj ID: \`${msg.id}\``)}`
          })
        ]
      });
    }

    // ===================== SLASH: /ingame-iptal =====================
    if (i.isChatInputCommand() && i.commandName === "ingame-iptal") {
      if (!isStaff(i.user.id)) {
        return replyE(i, createEmbed(guild, {
          title: line(EMOJI.lock, "ʏᴇᴛᴋɪ ʏᴏᴋ"),
          description: line(EMOJI.warn, "Sadece yetkililer.")
        }), true);
      }

      await i.deferReply({ flags: 64 });

      let targetMsgId = i.options.getString("mesaj_id");

      if (!targetMsgId) {
        const candidates = Array.from(ingameList.entries())
          .filter(([, d]) => d.channelId === i.channel.id && !d.closed);
        if (!candidates.length) {
          return i.editReply({
            embeds: [createEmbed(guild, {
              title: line(EMOJI.warn, "ʙᴜʟᴜɴᴀᴍᴀᴅɪ"),
              description: line(EMOJI.info, "Bu kanalda aktif bir ingame paneli yok. `mesaj_id` belirtebilirsin.")
            })]
          });
        }
        targetMsgId = candidates[candidates.length - 1][0];
      }

      const data = ingameList.get(targetMsgId);
      if (!data) {
        return i.editReply({
          embeds: [createEmbed(guild, {
            title: line(EMOJI.warn, "ʙᴜʟᴜɴᴀᴍᴀᴅɪ"),
            description: line(EMOJI.warn, "Belirtilen ID'ye ait bir panel bulunamadı.")
          })]
        });
      }
      if (data.closed) {
        return i.editReply({
          embeds: [createEmbed(guild, {
            title: line(EMOJI.info, "ʙɪʟɢɪ"),
            description: line(EMOJI.warn, "Bu panel zaten kapalı.")
          })]
        });
      }

      await closeIngame(guild, targetMsgId, `Yetkili tarafından iptal edildi (<@${i.user.id}>)`);

      return i.editReply({
        embeds: [createEmbed(guild, {
          title: line(EMOJI.success, "ɪᴘᴛᴀʟ ᴇᴅɪʟᴅɪ"),
          description: line(EMOJI.right, `Panel iptal edildi: \`${targetMsgId}\``)
        })]
      });
    }

    // ===================== SLASH: /ses-yasak =====================
    if (i.isChatInputCommand() && i.commandName === "ses-yasak") {
      if (!isStaff(i.user.id)) {
        return replyE(i, createEmbed(guild, {
          title: line(EMOJI.lock, "ʏᴇᴛᴋɪ ʏᴏᴋ"),
          description: line(EMOJI.warn, "Sadece yetkililer.")
        }), true);
      }

      const channel = i.options.getChannel("kanal", true);

      if (channel.type !== ChannelType.GuildVoice) {
        return replyE(i, createEmbed(guild, {
          title: line(EMOJI.warn, "ʜᴀᴛᴀ"),
          description: line(EMOJI.info, "Lütfen bir ses kanalı etiketle.")
        }), true);
      }

      await i.deferReply({ flags: 64 });

      // Zaten kilitliyse -> kilidi kaldır (toggle)
      if (voiceLocks.has(channel.id)) {
        voiceLocks.delete(channel.id);
        // O kanala ait deneme sayaçlarını temizle
        for (const key of Array.from(lockAttempts.keys())) {
          if (key.startsWith(`${channel.id}:`)) lockAttempts.delete(key);
        }

        return i.editReply({
          embeds: [createEmbed(guild, {
            title: line(EMOJI.success, "ᴋɪʟɪᴛ ᴋᴀʟᴅɪʀɪʟᴅɪ"),
            description: line(EMOJI.right, `${channel} artık serbest, herkes girebilir.`)
          })]
        });
      }

      // Kilitle: şu an kanalda olanları "izinli" say
      const allowedIds = new Set(channel.members.map((m) => m.id));
      voiceLocks.set(channel.id, { allowedIds, guildId: guild.id });

      return i.editReply({
        embeds: [createEmbed(guild, {
          title: line(EMOJI.lock, "ᴋᴀɴᴀʟ ᴋɪʟɪᴛʟᴇɴᴅɪ"),
          description:
            `${line(EMOJI.warn, `${channel} kilitlendi.`)}\n` +
            `${line(EMOJI.info, `Şu an kanalda olan **${allowedIds.size} kişi** hariç kimse giremez.`)}\n` +
            `${line(EMOJI.right, "Girmeye çalışan anında atılır, 3. denemede 60 saniye timeout yer.")}\n` +
            `${line(EMOJI.right, "Kilidi kaldırmak için komutu tekrar aynı kanala çalıştır.")}`
        })]
      });
    }

    // ===================== BUTTONS =====================
    if (!i.isButton()) return;

    // ---------- KATIL ----------
    if (i.customId === "ingame_join") {
      await i.deferReply({ flags: 64 });

      const msgId = i.message.id;
      const data = ingameList.get(msgId);

      if (!data) return i.editReply(line(EMOJI.warn, "Bu panel artık aktif değil."));
      if (data.closed) return i.editReply(line(EMOJI.lock, "Alımlar kapanmıştır."));

      if (data.users.includes(i.user.id) || data.yedek.includes(i.user.id)) {
        return i.editReply(line(EMOJI.warn, "Zaten katıldın."));
      }

      if (data.users.length < data.limit) {
        data.users.push(i.user.id);
        await refreshIngameMessage(guild, msgId);
        return i.editReply(line(EMOJI.success, `Katıldın! Sıran: **${data.users.length}**`));
      } else {
        data.yedek.push(i.user.id);
        await refreshIngameMessage(guild, msgId);
        return i.editReply(line(EMOJI.info, `Ana kadro dolu, **yedek listesine** eklendin. Yedek sıran: **${data.yedek.length}**`));
      }
    }

    // ---------- AYRIL ----------
    if (i.customId === "ingame_leave") {
      await i.deferReply({ flags: 64 });

      const msgId = i.message.id;
      const data = ingameList.get(msgId);

      if (!data) return i.editReply(line(EMOJI.warn, "Bu panel artık aktif değil."));

      const inMain = data.users.includes(i.user.id);
      const inYedek = data.yedek.includes(i.user.id);

      if (!inMain && !inYedek) return i.editReply(line(EMOJI.warn, "Listede değilsin."));

      if (inMain) {
        data.users = data.users.filter((id) => id !== i.user.id);
        if (data.yedek.length > 0 && data.users.length < data.limit) {
          const promoted = data.yedek.shift();
          data.users.push(promoted);
          const channel = guild.channels.cache.get(data.channelId);
          if (channel) {
            channel.send({
              embeds: [createEmbed(guild, {
                title: line(EMOJI.success, "ʏᴇᴅᴇᴋᴛᴇɴ ᴛᴇʀꜰɪ"),
                description: line(EMOJI.right, `<@${promoted}> yedekten ana kadroya yükseltildi.`)
              })]
            }).catch(() => {});
          }
        }
      } else {
        data.yedek = data.yedek.filter((id) => id !== i.user.id);
      }

      if (data.closed && data.users.length < data.limit && data.endsAt && data.endsAt > Date.now()) {
        data.closed = false;
      }

      await refreshIngameMessage(guild, msgId);
      return i.editReply(line(EMOJI.right, "Listeden ayrıldın."));
    }

    // ---------- BİLGİ ----------
    if (i.customId === "ingame_info") {
      const msgId = i.message.id;
      const data = ingameList.get(msgId);

      if (!data) {
        return i.reply({ content: line(EMOJI.warn, "Bu panel artık aktif değil."), flags: 64 });
      }

      const remaining = data.endsAt ? data.endsAt - Date.now() : null;

      return i.reply({
        embeds: [
          createEmbed(guild, {
            title: line(EMOJI.info, "ɪɴɢᴀᴍᴇ ʙɪʟɢɪ"),
            description:
              `${line(EMOJI.star, `Etkinlik: **${data.title}**`)}\n` +
              `${line(EMOJI.right, `Kadro: **${data.users.length} / ${data.limit}**`)}\n` +
              `${line(EMOJI.right, `Yedek: **${data.yedek.length}**`)}\n` +
              `${line(EMOJI.warn, `Durum: **${data.closed ? "Kapalı" : "Açık"}**`)}\n` +
              `${line(EMOJI.settings, `Süre: **${data.closed ? "Kapandı" : (remaining !== null ? formatRemaining(remaining) : "Belirsiz")}**`)}`
          })
        ],
        flags: 64
      });
    }

    // ---------- İPTAL ET (buton) ----------
    if (i.customId === "ingame_cancel") {
      if (!isStaff(i.user.id)) {
        return i.reply({ content: line(EMOJI.lock, "Bu işlemi yapma yetkin yok."), flags: 64 });
      }

      await i.deferReply({ flags: 64 });

      const msgId = i.message.id;
      const data = ingameList.get(msgId);
      if (!data) return i.editReply(line(EMOJI.warn, "Bu panel artık aktif değil."));

      await closeIngame(guild, msgId, `Yetkili tarafından iptal edildi (<@${i.user.id}>)`);
      return i.editReply(line(EMOJI.lock, "Panel iptal edildi."));
    }

    // ---------- KONTROL (FiveM discord id sorgusu) ----------
    if (i.customId === "ingame_kontrol") {
      if (!isStaff(i.user.id)) {
        return i.reply({ content: line(EMOJI.lock, "Bu işlemi yapma yetkin yok."), flags: 64 });
      }

      await i.deferReply({ flags: 64 });

      const msgId = i.message.id;
      const data = ingameList.get(msgId);
      if (!data) return i.editReply(line(EMOJI.warn, "Bu panel artık aktif değil."));

      const allUsers = [
        ...data.users.map((id) => ({ id, tip: "Ana Kadro" })),
        ...data.yedek.map((id) => ({ id, tip: "Yedek" }))
      ];

      if (!allUsers.length) {
        return i.editReply(line(EMOJI.warn, "Kontrol edilecek katılımcı yok."));
      }

      let discordIndex;
      try {
        const json = await getServerPlayersCached();
        discordIndex = buildDiscordIdIndex(json);
      } catch (err) {
        console.error("KONTROL API HATA:", err);
        return i.editReply(line(EMOJI.warn, `FiveM API bağlantı hatası: ${err?.message || "bilinmeyen hata"}`));
      }

      const lines = allUsers.map(({ id, tip }) => {
        const found = discordIndex.get(id);
        if (found) {
          return line(EMOJI.success, `<@${id}> \`(${tip})\` → **Sunucuda** (${found.name}, ID: \`${found.id}\`, Ping: \`${found.ping}\`)`);
        }
        return line(EMOJI.warn, `<@${id}> \`(${tip})\` → **Sunucuda değil**`);
      });

      const chunks = [];
      let current = "";
      for (const l of lines) {
        if ((current + "\n" + l).length > 3800) {
          chunks.push(current);
          current = l;
        } else {
          current = current ? current + "\n" + l : l;
        }
      }
      if (current) chunks.push(current);

      const foundCount = allUsers.filter(({ id }) => discordIndex.has(id)).length;

      const embeds = chunks.map((desc, idx) =>
        createEmbed(guild, {
          title: idx === 0
            ? line(EMOJI.search, `ᴋᴏɴᴛʀᴏʟ ꜱᴏɴᴜᴄᴜ (${foundCount}/${allUsers.length} sunucuda)`)
            : line(EMOJI.search, "ᴋᴏɴᴛʀᴏʟ ꜱᴏɴᴜᴄᴜ (devam)"),
          description: desc
        })
      );

      return i.editReply({ embeds: embeds.slice(0, 10) });
    }

  } catch (err) {
    console.error("interactionCreate error:", err);
  }
});

// ===================== LOGIN =====================
client.login(TOKEN)
  .then(() => console.log("✅ Discord Login OK"))
  .catch((err) => console.error("❌ Discord Login FAIL:", err));
