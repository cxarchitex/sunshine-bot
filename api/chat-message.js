document.addEventListener("DOMContentLoaded", function () {
  function getSessionId() {
    let id = localStorage.getItem("chat_session_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("chat_session_id", id);
    }
    return id;
  }

  const sessionId = getSessionId();

  const bubble = document.getElementById("chat-bubble");
  const widget = document.getElementById("chat-widget");
  const closeBtn = document.getElementById("chat-close");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const messages = document.getElementById("chat-messages");

  if (!bubble || !widget) return;

  bubble.addEventListener("click", () => {
    widget.classList.remove("chat-hidden");
    setTimeout(() => widget.classList.add("chat-visible"), 10);
    bubble.style.display = "none";
    input.focus();
  });

  closeBtn.addEventListener("click", () => {
    widget.classList.remove("chat-visible");
    setTimeout(() => widget.classList.add("chat-hidden"), 200);
    bubble.style.display = "flex";
  });

  function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = role;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    addMessage("user", text);

    try {
      const res = await fetch(
        "https://YOUR-VERCEL-PROJECT.vercel.app/api/chat-message",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            message: text
          })
        }
      );

      const data = await res.json();
      if (data.reply) {
        addMessage("bot", data.reply);
      }
    } catch (err) {
      addMessage("bot", "Something went wrong. Please try again.");
    }
  }

  sendBtn.addEventListener("click", sendMessage);

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });
});
