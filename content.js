let sessionTimeout = null;
let config = {
  apiUrl: null,
  responsavel: "Desconhecido"
};

const STORAGE_KEY = "whatsapp_session_data";

function getNow() {
  return Date.now();
}

function getDateFormated(data) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = data.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function loadSession() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : null;
}

function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  let session = loadSession();
  if (!session) {
    startOrContinueSession();
  }
}

function startOrContinueSession() {
  const now = getNow();
  let session = loadSession();

  if (!session) {
    session = {
      data: getDateFormated(new Date()),
      inicio: now,
      fim: now,
      duracao_minutos: 0,
      mensagens: 0,
      responsavel: config.responsavel || "Desconhecido"
    };
    console.log("🟢 Sessão iniciada", session);
  } else {
    const start = session.inicio;
    const end = now;
    const diffMin = Math.floor((end - start) / 60000);
    session.duracao_minutos = diffMin + 1;
    session.fim = end;
    session.mensagens += 1;
    console.log("🔁 Sessão atualizada", session);
  }

  saveSession(session);

  if (sessionTimeout) clearTimeout(sessionTimeout);
  sessionTimeout = setTimeout(() => {
    endSession(session);
  }, 60000);
}

function endSession(session) {
  console.log("⛔ Tentando encerrar sessão:", session);

  const isValidSession =
    session &&
    session.inicio &&
    session.fim &&
    session.inicio < session.fim &&
    session.mensagens > 0 &&
    session.duracao_minutos > 0;

  if (!config.apiUrl) {
    console.warn("❌ API URL não configurada. Sessão não será enviada.");
  }

  if (isValidSession && config.apiUrl) {
    console.log("✅ Sessão válida. Enviando ao n8n...");
    fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(session)
    }).catch((err) => console.error("Erro ao enviar sessão:", err));
  } else {
    console.warn("⚠️ Sessão inválida. Dados não enviados.");
  }

  clearSession();
  sessionTimeout = null;
}

function extractDateFromMessage(node) {
  const copyable = node.querySelector(".copyable-text");
  if (!copyable) return null;

  const prePlainText = copyable.getAttribute("data-pre-plain-text");
  if (!prePlainText) return null;

  const match = prePlainText.match(/\[(\d{2}:\d{2}), (\d{2}\/\d{2}\/\d{4})\]/);
  if (match) {
    const [_, time, date] = match;
    const [day, month, year] = date.split("/");
    const isoString = `${year}-${month}-${day}T${time}:00`;
    return new Date(isoString).getTime();
  }

  return null;
}

const observer = new MutationObserver((mutationsList) => {
  for (let mutation of mutationsList) {
    if (mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach((node) => {
        if (node.querySelector) {
          const isOutgoing = node.querySelectorAll(".message-out");

          if (isOutgoing && isOutgoing.length > 0) {
            const session = loadSession();
            const sessionStart = session?.inicio;
            const messageDate = extractDateFromMessage(node);

            if (messageDate && sessionStart) {
              if (messageDate < sessionStart) {
                console.log("⏱️ Ignorando mensagem anterior ao início da sessão.");
                return;
              }
              startOrContinueSession();
            }
          }
        }
      });
    }
  }
});

function waitForAppAndStart() {
  const target = document.querySelector("#app");
  if (target) {
    observer.observe(target, {
      childList: true,
      subtree: true
    });
    let session = loadSession();
    if (!session) {
      startOrContinueSession();
    }
    console.log("✅ Rastreador de sessões ativado!");
  } else {
    setTimeout(waitForAppAndStart, 1000);
  }
}

function loadConfigAndStart() {
  chrome.storage.sync.get(["apiUrl", "responsavel"], (result) => {
    config.apiUrl = result.apiUrl || null;
    config.responsavel = result.responsavel || "Desconhecido";
    console.log("⚙️ Configuração carregada:", config);
    waitForAppAndStart();
  });
}

loadConfigAndStart();
