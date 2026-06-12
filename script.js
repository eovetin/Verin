const form = document.querySelector("#generator");
const previewButton = document.querySelector("#preview-button");
const emptyState = document.querySelector("#empty-state");
const summary = document.querySelector("#summary");
const summaryName = document.querySelector("#summary-name");
const summaryVersion = document.querySelector("#summary-version");
const summaryAddonVersion = document.querySelector("#summary-addon-version");
const summaryPackage = document.querySelector("#summary-package");
const summaryDescription = document.querySelector("#summary-description");
const fileList = document.querySelector("#file-list");
const installButton = document.querySelector("#install-app");

let deferredInstallPrompt;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = undefined;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const project = await buildAddonProject();
  renderSummary(project);
  await downloadProject(project);
});

previewButton.addEventListener("click", async () => {
  if (!form.reportValidity()) {
    return;
  }

  const project = await buildAddonProject();
  renderSummary(project);
});

async function buildAddonProject() {
  const data = new FormData(form);
  const addonName = data.get("addonName").trim();
  const namespace = sanitizeNamespace(data.get("namespace"));
  const minecraftVersion = data.get("minecraftVersion").trim();
  const addonVersion = data.get("addonVersion").trim();
  const packageType = data.get("packageType");
  const modType = data.get("modType");
  const textureColor = data.get("textureColor");
  const modDescription = data.get("modDescription").trim();
  const slug = slugify(addonName);
  const identifier = `${namespace}:${slug}`;
  const packRoot = `${slug}_addon_docs`;
  const behaviorPath = `${slug}_BP`;
  const resourcePath = `${slug}_RP`;
  const addonVersionArray = toVersionArray(addonVersion);
  const bedrockVersionArray = toVersionArray(minecraftVersion);
  const resourceHeaderUuid = createUuid();
  const behaviorHeaderUuid = createUuid();

  const files = new Map();
  const addJson = (path, value) => files.set(path, `${JSON.stringify(value, null, 2)}\n`);
  const addText = (path, value) => files.set(path, value.endsWith("\n") ? value : `${value}\n`);

  addJson(`${behaviorPath}/manifest.json`, {
    format_version: 2,
    header: {
      name: `${addonName} BP`,
      description: `Behavior pack gerado pelo Criador de Mods IA para Bedrock ${minecraftVersion}.`,
      uuid: behaviorHeaderUuid,
      version: addonVersionArray,
      min_engine_version: bedrockVersionArray,
    },
    modules: [
      {
        type: "data",
        uuid: createUuid(),
        version: addonVersionArray,
      },
      {
        type: "script",
        language: "javascript",
        uuid: createUuid(),
        version: addonVersionArray,
        entry: "scripts/main.js",
      },
    ],
    dependencies: [
      {
        module_name: "@minecraft/server",
        version: "1.11.0",
      },
      {
        uuid: resourceHeaderUuid,
        version: addonVersionArray,
      },
    ],
  });

  addJson(`${resourcePath}/manifest.json`, {
    format_version: 2,
    header: {
      name: `${addonName} RP`,
      description: `Resource pack gerado pelo Criador de Mods IA para Bedrock ${minecraftVersion}.`,
      uuid: resourceHeaderUuid,
      version: addonVersionArray,
      min_engine_version: bedrockVersionArray,
    },
    modules: [
      {
        type: "resources",
        uuid: createUuid(),
        version: addonVersionArray,
      },
    ],
  });

  addJson(`${behaviorPath}/items/${slug}.json`, {
    format_version: "1.20.80",
    "minecraft:item": {
      description: {
        identifier,
        menu_category: {
          category: "equipment",
          group: "itemGroup.name.sword",
        },
      },
      components: {
        "minecraft:display_name": {
          value: `item.${identifier}.name`,
        },
        "minecraft:icon": slug,
        "minecraft:max_stack_size": 1,
        "minecraft:damage": 8,
        "minecraft:durability": {
          max_durability: 450,
        },
        "minecraft:hand_equipped": true,
      },
    },
  });

  addJson(`${behaviorPath}/recipes/${slug}.json`, {
    format_version: "1.20.80",
    "minecraft:recipe_shaped": {
      description: {
        identifier: `${namespace}:${slug}_recipe`,
      },
      tags: ["crafting_table"],
      pattern: [" D ", " D ", " S "],
      key: {
        D: {
          item: "minecraft:diamond",
        },
        S: {
          item: "minecraft:stick",
        },
      },
      result: {
        item: identifier,
        count: 1,
      },
    },
  });

  addText(`${behaviorPath}/scripts/main.js`, createScript({ addonName, identifier, modDescription }));
  addJson(`${resourcePath}/textures/item_texture.json`, {
    resource_pack_name: `${slug}_RP`,
    texture_name: "atlas.items",
    texture_data: {
      [slug]: {
        textures: `textures/items/${slug}`,
      },
    },
  });
  addText(`${resourcePath}/texts/pt_BR.lang`, `item.${identifier}.name=${addonName}`);
  addText(`${resourcePath}/texts/en_US.lang`, `item.${identifier}.name=${addonName}`);
  files.set(`${resourcePath}/textures/items/${slug}.png`, await createTexture(textureColor));
  addText(`${packRoot}/PROMPT_PARA_IA.txt`, createPrompt({ addonName, namespace, minecraftVersion, addonVersion, modType, modDescription }));
  addText(`${packRoot}/LEIA-ME.txt`, createReadme({ addonName, minecraftVersion, addonVersion, packageType, identifier }));

  return {
    addonName,
    minecraftVersion,
    addonVersion,
    packageType,
    modDescription,
    slug,
    files,
  };
}

function renderSummary(project) {
  summaryName.textContent = project.addonName;
  summaryVersion.textContent = project.minecraftVersion;
  summaryAddonVersion.textContent = project.addonVersion;
  summaryPackage.textContent = `.${project.packageType}`;
  summaryDescription.textContent = project.modDescription;
  fileList.replaceChildren(
    ...Array.from(project.files.keys()).map((path) => {
      const item = document.createElement("li");
      item.textContent = path;
      return item;
    }),
  );

  emptyState.hidden = true;
  summary.hidden = false;
}

async function downloadProject(project) {
  const zipBytes = createZip(project.files);
  const extension = project.packageType === "mcaddon" ? "mcaddon" : "zip";
  const blob = new Blob([zipBytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.slug}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createScript({ addonName, identifier, modDescription }) {
  return `import { world } from "@minecraft/server";

const ADDON_NAME = ${JSON.stringify(addonName)};
const SPECIAL_ITEM = ${JSON.stringify(identifier)};
const ORIGINAL_IDEA = ${JSON.stringify(modDescription)};

world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  const item = event.itemStack;

  if (!player || item?.typeId !== SPECIAL_ITEM) {
    return;
  }

  player.dimension.spawnEntity("minecraft:lightning_bolt", player.location);
  player.sendMessage("§b" + ADDON_NAME + ": poder ativado!");
});

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) {
    return;
  }

  event.player.sendMessage("§aAddon " + ADDON_NAME + " carregado. Ideia: " + ORIGINAL_IDEA);
});
`;
}

function createPrompt({ addonName, namespace, minecraftVersion, addonVersion, modType, modDescription }) {
  return `Você é uma IA especialista em addons do Minecraft Bedrock.
Crie/complete um addon funcional usando estes dados:

Nome: ${addonName}
Namespace: ${namespace}
Versão alvo do Minecraft Bedrock: ${minecraftVersion}
Versão do mod: ${addonVersion}
Tipo principal: ${modType}
Ideia do usuário: ${modDescription}

Gere JSON, scripts JavaScript, texturas e ajustes necessários para deixar o addon mais completo.
Mantenha a estrutura behavior_packs + resource_packs e valide manifests, UUIDs e caminhos de textura.`;
}

function createReadme({ addonName, minecraftVersion, addonVersion, packageType, identifier }) {
  return `${addonName}

Arquivo gerado pelo Criador de Mods IA.
Versão alvo do Minecraft Bedrock: ${minecraftVersion}
Versão do mod: ${addonVersion}
Formato escolhido: .${packageType}
Identificador principal: ${identifier}

Como usar:
1. Importe o arquivo .mcaddon no Minecraft Bedrock.
2. Ative o behavior pack e o resource pack no mundo.
3. Se o mundo pedir recursos experimentais para script, ative as opções necessárias.
4. Use o arquivo PROMPT_PARA_IA.txt para pedir que uma IA melhore o addon.

Observação: o pacote é uma base gerada automaticamente. Teste no Minecraft Bedrock da versão escolhida e ajuste APIs que mudarem entre versões.`;
}

async function createTexture(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#1a1a1a";
  context.fillRect(0, 0, 16, 16);
  context.fillStyle = color;
  context.fillRect(6, 1, 4, 10);
  context.fillRect(5, 9, 6, 2);
  context.fillStyle = "#ffffff";
  context.fillRect(7, 2, 1, 7);
  context.fillStyle = "#6b3a13";
  context.fillRect(7, 11, 2, 4);
  context.fillStyle = "#ffd866";
  context.fillRect(5, 10, 6, 1);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

function sanitizeNamespace(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "") || "ia_mod";
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "addon_ia";
}

function toVersionArray(value) {
  const parts = value.split(".").map((part) => Number.parseInt(part, 10));
  while (parts.length < 3) {
    parts.push(0);
  }
  return parts.slice(0, 3);
}

function createUuid() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) =>
    (Number(character) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(character) / 4)))).toString(16),
  );
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [path, content] of files.entries()) {
    const nameBytes = encoder.encode(path);
    const contentBytes = typeof content === "string" ? encoder.encode(content) : content;
    const crc = crc32(contentBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeZipHeader(localView, crc, contentBytes.length, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, contentBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeZipHeader(centralView, crc, contentBytes.length, nameBytes.length, false);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + contentBytes.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.size, true);
  endView.setUint16(10, files.size, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return concatBytes([...localParts, ...centralParts, end]);
}

function writeZipHeader(view, crc, size, nameLength, isLocal) {
  view.setUint32(0, isLocal ? 0x04034b50 : 0x02014b50, true);
  if (!isLocal) {
    view.setUint16(4, 20, true);
  }
  view.setUint16(isLocal ? 4 : 6, 20, true);
  view.setUint16(isLocal ? 6 : 8, 0x0800, true);
  view.setUint16(isLocal ? 8 : 10, 0, true);
  view.setUint16(isLocal ? 10 : 12, 0, true);
  view.setUint16(isLocal ? 12 : 14, 0, true);
  view.setUint32(isLocal ? 14 : 16, crc, true);
  view.setUint32(isLocal ? 18 : 20, size, true);
  view.setUint32(isLocal ? 22 : 24, size, true);
  view.setUint16(isLocal ? 26 : 28, nameLength, true);
}

function concatBytes(parts) {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(totalLength);
  let cursor = 0;
  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}
