module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { slackUserId, type, data } = req.body;
  const botToken = process.env.SLACK_BOT_TOKEN;

  if (!botToken) return res.status(500).json({ error: "SLACK_BOT_TOKEN not configured" });
  if (!slackUserId) return res.status(400).json({ error: "Missing slackUserId" });

  let message = "";

  if (type === "email") {
    message = {
      text: `📧 *Nouvel email important*`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📧 *Nouvel email important*\n*De :* ${data.from}\n*Objet :* ${data.subject}\n_${data.snippet}_`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "📬 Ouvrir dans Gmail" },
              url: data.gmailUrl,
              style: "primary"
            }
          ]
        }
      ]
    };
  } else if (type === "meeting") {
    message = {
      text: `📅 *Meeting dans ${data.minutesLeft} min*`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📅 *Meeting dans ${data.minutesLeft} min*\n*${data.title}*\n🕐 ${data.time}`
          }
        },
        data.meetLink ? {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "🎥 Rejoindre le Meet" },
              url: data.meetLink,
              style: "primary"
            }
          ]
        } : null
      ].filter(Boolean)
    };
  } else if (type === "summary") {
    message = {
      text: `✨ Résumé de ta journée`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✨ *Résumé de ta journée*\n\n${data.summary}`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "🖥 Ouvrir le dashboard" },
              url: "https://dashboard-tau-nine-77.vercel.app",
              style: "primary"
            }
          ]
        }
      ]
    };
  } else if (type === "deskare") {
    message = {
      text: `🪑 Rappel Deskare`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🪑 *Rappel hebdomadaire*\nN'oublie pas de réserver ta place sur Deskare pour la semaine !`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "📅 Réserver ma place" },
              url: "https://app.deskare.io",
              style: "primary"
            }
          ]
        }
      ]
    };
  }

  try {
    // Ouvrir un DM avec l'utilisateur
    const openDM = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${botToken}`
      },
      body: JSON.stringify({ users: slackUserId })
    });
    const dmData = await openDM.json();
    if (!dmData.ok) return res.status(500).json({ error: dmData.error });

    const channelId = dmData.channel.id;

    // Envoyer le message
    const sendMsg = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${botToken}`
      },
      body: JSON.stringify({ channel: channelId, ...message })
    });
    const msgData = await sendMsg.json();
    if (!msgData.ok) return res.status(500).json({ error: msgData.error });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};