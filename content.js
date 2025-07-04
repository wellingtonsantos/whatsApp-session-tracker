let sessionTimeouts = {}; // Múltiplos timeouts por contato
let config = {
  apiUrl: null,
  responsavel: "Desconhecido",
};

function getNow() {
  return Date.now();
}

function getDateFormated(data) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = data.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function getSessionKey(contactName) {
  return `whatsapp_session_data_${contactName}`;
}

function loadSession(contactName) {
  const key = getSessionKey(contactName);
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

function saveSession(contactName, session) {
  const key = getSessionKey(contactName);
  localStorage.setItem(key, JSON.stringify(session));
}

function clearSession(contactName) {
  const key = getSessionKey(contactName);
  localStorage.removeItem(key);
  if (sessionTimeouts[contactName]) {
    clearTimeout(sessionTimeouts[contactName]);
    delete sessionTimeouts[contactName];
  }
}

function getActiveChatName() {
  const header = document.querySelector("header");
  if (!header) return "Desconhecido";

  const nameEl = header.querySelector("span._ao3e:not(img)");
  if (nameEl && nameEl.innerText.trim()) {
    return nameEl.innerText.trim();
  }

  return "Desconhecido";
}

function updateTotalBadge() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith("whatsapp_session_data_")) {
      const session = JSON.parse(localStorage.getItem(key));
      total += session.duracao_minutos || 0;
    }
  }

  chrome.runtime.sendMessage({
    type: "update-badge",
    text: total > 0 ? total.toString() : "",
  });
}

function startOrContinueSession(contactName) {
  const now = getNow();
  let session = loadSession(contactName);

  if (!session) {
    session = {
      data: getDateFormated(new Date()),
      inicio: now,
      fim: now,
      duracao_minutos: 0,
      mensagens: 1,
      responsavel: config.responsavel,
      contato: contactName,
    };
    console.log(`🟢 Sessão iniciada para ${contactName}`, session);
  } else {
    const start = session.inicio;
    const end = now;
    const diffMin = Math.floor((end - start) / 60000);
    session.duracao_minutos = diffMin + 1;
    session.fim = end;
    session.mensagens += 1;
    console.log(`🔁 Sessão atualizada para ${contactName}`, session);
  }

  saveSession(contactName, session);
  updateTotalBadge();

  if (sessionTimeouts[contactName]) {
    clearTimeout(sessionTimeouts[contactName]);
  }

  sessionTimeouts[contactName] = setTimeout(() => {
    endSession(contactName, session);
  }, 60000);
}

function endSession(contactName, session) {
  console.log(`⛔ Tentando encerrar sessão de ${contactName}:`, session);

  const isValidSession =
    session &&
    session.inicio &&
    session.fim &&
    session.inicio < session.fim &&
    session.mensagens > 0;

  if (!isValidSession) {
    console.warn(`⚠️ Sessão inválida de ${contactName}. Dados não enviados.`);
    clearSession(contactName);
    updateTotalBadge();
    return;
  }

  const maxAllowedSeconds = session.mensagens * 60;
  const actualSeconds = Math.floor((session.fim - session.inicio) / 1000);

  if (actualSeconds > maxAllowedSeconds) {
    console.warn(
      `⚠️ Sessão de ${contactName} excedeu o limite permitido. Ajustando duração de ${actualSeconds}s para ${maxAllowedSeconds}s.`
    );
    session.fim = session.inicio + maxAllowedSeconds * 1000;
    session.duracao_minutos = Math.ceil(maxAllowedSeconds / 60);
  }

  if (!config.apiUrl) {
    console.warn("❌ API URL não configurada. Sessão não será enviada.");
  } else {
    console.log(`✅ Enviando sessão válida de ${contactName} à API...`);
    fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(session),
    }).catch((err) =>
      console.error(`Erro ao enviar sessão de ${contactName}:`, err)
    );
  }

  clearSession(contactName);
  updateTotalBadge();
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
            const contactName = getActiveChatName();
            const messageDate = extractDateFromMessage(node);
            const now = getNow();

            // Se não for possível extrair a data, usa o momento atual
            const effectiveMessageTime = messageDate || now;

            let session = loadSession(contactName);

            // Cria a sessão se ainda não existir
            if (!session) {
              startOrContinueSession(contactName);
              session = loadSession(contactName);
            }

            const sessionStart = session?.inicio || now;

            if (effectiveMessageTime < sessionStart - 1000) {
              console.warn(
                `⏱️ Mensagem anterior ao início da sessão de ${contactName}. Ajustando com getNow().`
              );
              startOrContinueSession(contactName);
              return;
            }

            startOrContinueSession(contactName);
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
      subtree: true,
    });
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
