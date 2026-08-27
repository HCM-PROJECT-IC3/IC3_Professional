    import * as THREE from "three";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";
    import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
    import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
    import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

    const BOOKS = [
      {
        id: "computing-fundamentals",
        title: "Computing Fundamentals",
        roman: "I",
        discipline: "Digital Literacy",
        note: "The building blocks of computers, devices, and operating systems.",
        deck: "A foundational guide to Computing Fundamentals: understand hardware and software, navigate operating systems, and build the digital literacy every IC3 candidate starts with.",
        binding: "Meadow-green cloth · bronze foil",
        format: "148 × 216 mm · IC3 GS6 edition",
        theme: "Computing Fundamentals · the building blocks of digital literacy",
        motif: "Monitor and circuit trace",
        motifKey: "monitor",
        paletteLabel: "Meadow green · bone · bronze",
        color: "#5e8134",
        foil: "#8a6a3a",
        palette: {
          paper: "#3c4d24",
          paperDeep: "#293618",
          paperPale: "#eef1e2",
          ink: "#f4f6ea",
          inkSoft: "#c4cdb0",
          wall: "#3c4d24",
          shelf: "#3a2118",
          shelfDark: "#1c0e0a",
          light: "#d8e4b9",
          fill: "#9fc98f"
        },
        width: 1.02,
        height: 1.58,
        depth: 0.26,
        chapters: ["Hardware", "Software", "Operating systems"],
        seed: 11
      },
      {
        id: "key-apps-word",
        title: "Key Applications (Word)",
        roman: "II",
        discipline: "Document Processing",
        note: "Formatting, structuring, and producing polished documents.",
        practiceUrl: "word-simulator.html",
        practiceLabel: "Luyện tập Ribbon",
        deck: "A working guide to word processing: format text with purpose, structure long documents, and produce professional files worth handing in.",
        binding: "Navy cloth · silver foil",
        format: "156 × 228 mm · IC3 GS6 edition",
        theme: "Key Applications · document processing",
        motif: "Ruled document page",
        motifKey: "document",
        paletteLabel: "Navy · cream · silver",
        color: "#313c64",
        foil: "#c7cbd6",
        palette: {
          paper: "#232c4d",
          paperDeep: "#171d35",
          paperPale: "#eef0f6",
          ink: "#f4f5f9",
          inkSoft: "#b7bdd2",
          wall: "#232c4d",
          shelf: "#402015",
          shelfDark: "#1d0d08",
          light: "#d7dcef",
          fill: "#8b96c4"
        },
        width: 1.1,
        height: 1.46,
        depth: 0.29,
        chapters: ["Formatting", "Structure", "Publishing"],
        seed: 22
      },
      {
        id: "key-apps-excel",
        title: "Key Applications (Excel)",
        roman: "III",
        discipline: "Spreadsheets",
        note: "Organizing data, building formulas, and reading the results.",
        deck: "A compact handbook for spreadsheets: organize raw data into tables, write formulas that hold up, and turn rows and columns into an answer.",
        binding: "Forest-green cloth · gold foil",
        format: "140 × 210 mm · IC3 GS6 edition",
        theme: "Key Applications · spreadsheets",
        motif: "Grid and formula bar",
        motifKey: "grid",
        paletteLabel: "Forest green · ivory · gold",
        color: "#4c7936",
        foil: "#d1a941",
        palette: {
          paper: "#2f4c22",
          paperDeep: "#203316",
          paperPale: "#eef3e6",
          ink: "#f4f8ee",
          inkSoft: "#bdd0ad",
          wall: "#2f4c22",
          shelf: "#3b2418",
          shelfDark: "#1c0f09",
          light: "#dcecc9",
          fill: "#8fbf78"
        },
        width: 0.92,
        height: 1.52,
        depth: 0.22,
        chapters: ["Data entry", "Formulas", "Analysis"],
        seed: 33
      },
      {
        id: "key-apps-powerpoint",
        title: "Key Applications (PowerPoint)",
        roman: "IV",
        discipline: "Presentation Skills",
        note: "Turning ideas into slides an audience can follow.",
        deck: "A practical guide to presentation skills: shape an argument into slides, design for readability, and deliver an idea an audience can follow.",
        binding: "Burnt-orange cloth · charcoal foil",
        format: "162 × 240 mm · IC3 GS6 edition",
        theme: "Key Applications · presentation skills",
        motif: "Slide layout grid",
        motifKey: "slide",
        paletteLabel: "Burnt orange · cream · charcoal",
        color: "#ab5121",
        foil: "#3a3530",
        palette: {
          paper: "#7a3717",
          paperDeep: "#552510",
          paperPale: "#fbe9d9",
          ink: "#fff2e4",
          inkSoft: "#e3bd9f",
          wall: "#7a3717",
          shelf: "#3b2117",
          shelfDark: "#1a0d08",
          light: "#ffd9b0",
          fill: "#dd935e"
        },
        width: 1.08,
        height: 1.68,
        depth: 0.25,
        chapters: ["Structure", "Design", "Delivery"],
        seed: 44
      },
      {
        id: "living-online",
        title: "Living Online",
        roman: "V",
        discipline: "Online Safety and Responsibility",
        note: "Staying safe, private, and responsible in connected spaces.",
        deck: "A field guide to living online: protect personal information, spot manipulation and misinformation, and act responsibly across networks and platforms.",
        binding: "Plum cloth · rose-gold foil",
        format: "150 × 220 mm · IC3 GS6 edition",
        theme: "Living Online · safety and responsibility",
        motif: "Shield and network",
        motifKey: "shield",
        paletteLabel: "Plum · lilac · rose gold",
        color: "#674c75",
        foil: "#c9a0c4",
        palette: {
          paper: "#4a3653",
          paperDeep: "#332439",
          paperPale: "#f1e9f4",
          ink: "#f7f0f9",
          inkSoft: "#cbb9d1",
          wall: "#4a3653",
          shelf: "#432016",
          shelfDark: "#1f0d08",
          light: "#e4d3ec",
          fill: "#a482ae"
        },
        width: 1,
        height: 1.48,
        depth: 0.3,
        chapters: ["Privacy", "Safety", "Responsibility"],
        seed: 55
      },
      {
        id: "computational-thinking",
        title: "Computational Thinking",
        roman: "VI",
        discipline: "Problem Solving and Programming Concepts",
        note: "Breaking problems apart and thinking in steps and systems.",
        deck: "A studio notebook for computational thinking: decompose problems, recognize patterns, and reason through algorithms and basic programming concepts.",
        binding: "Teal cloth · slate foil",
        format: "146 × 224 mm · IC3 GS6 edition",
        theme: "Computational Thinking · problem solving and programming concepts",
        motif: "Flowchart nodes",
        motifKey: "flowchart",
        paletteLabel: "Teal · mist · slate",
        color: "#357485",
        foil: "#8fa9b0",
        palette: {
          paper: "#20505c",
          paperDeep: "#153840",
          paperPale: "#e6f2f4",
          ink: "#eef8fa",
          inkSoft: "#a9c9cf",
          wall: "#20505c",
          shelf: "#402016",
          shelfDark: "#1d0d08",
          light: "#c7e4e9",
          fill: "#6ba7b3"
        },
        width: 0.96,
        height: 1.57,
        depth: 0.24,
        chapters: ["Decomposition", "Patterns", "Algorithms"],
        seed: 66
      },
      {
        id: "digital-citizenship",
        title: "Digital Citizenship",
        roman: "VII",
        discipline: "Technology in Society",
        note: "Technology's impact on people, communities, and society.",
        deck: "A closing survey of digital citizenship: weigh technology's impact on communities and society, and practice the judgment good digital citizens rely on.",
        binding: "Goldenrod cloth · walnut foil",
        format: "158 × 232 mm · IC3 GS6 edition",
        theme: "Digital Citizenship · technology in society",
        motif: "Connected people",
        motifKey: "people",
        paletteLabel: "Goldenrod · cream · walnut",
        color: "#c59237",
        foil: "#6b4a2a",
        palette: {
          paper: "#8a611f",
          paperDeep: "#5f4114",
          paperPale: "#faf0dc",
          ink: "#fff6e6",
          inkSoft: "#e3c99a",
          wall: "#8a611f",
          shelf: "#382017",
          shelfDark: "#1b0e09",
          light: "#f6e0ad",
          fill: "#dbb15e"
        },
        width: 1.12,
        height: 1.63,
        depth: 0.28,
        chapters: ["Impact", "Ethics", "Citizenship"],
        seed: 77
      }
    ];

    const COVER_ATLAS_DATA = "data:image/webp;base64,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";
    // The walnut map and the new GPT Image cover atlas are embedded so the browser
    // never calls a generation service or depends on an asset host.
    const WOOD_TEXTURE_DATA = "data:image/webp;base64,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";

    // Seven 2:3 cover artworks arranged left to right in one embedded atlas.
    const COVER_CROPS = [
      [0, 0, 512, 768],
      [512, 0, 512, 768],
      [1024, 0, 512, 768],
      [1536, 0, 512, 768],
      [2048, 0, 512, 768],
      [2560, 0, 512, 768],
      [3072, 0, 512, 768]
    ];
    const coverAtlasImage = new Image();
    coverAtlasImage.decoding = "async";
    coverAtlasImage.src = COVER_ATLAS_DATA;
    let coverAtlasReady = false;
    const woodTextureImage = new Image();
    woodTextureImage.decoding = "async";
    woodTextureImage.src = WOOD_TEXTURE_DATA;
    let woodTextureReady = false;

    const experience = document.querySelector("#experience");
    const canvas = document.querySelector("#scene");
    const loading = document.querySelector("#loading");
    const fallbackStatus = document.querySelector("#fallback-status");
    const browseUi = document.querySelector("#browse-ui");
    const detailPanel = document.querySelector("#detail-panel");
    const selectionTitle = document.querySelector("#selection-title");
    const selectionNote = document.querySelector("#selection-note");
    const counter = document.querySelector("#counter");
    const paletteLabel = document.querySelector("#palette-label");
    const markers = document.querySelector("#markers");
    const previousButton = document.querySelector("#previous");
    const nextButton = document.querySelector("#next");
    const inspectButton = document.querySelector("#inspect");
    const closeButton = document.querySelector("#close-detail");
    const resetButton = document.querySelector("#reset-view");
    const toggleBookButton = document.querySelector("#toggle-book");
    const practiceButton = document.querySelector("#practice-btn");
    const previousPageButton = document.querySelector("#previous-page");
    const nextPageButton = document.querySelector("#next-page");
    const pageLabel = document.querySelector("#page-label");
    const pageCounter = document.querySelector("#page-counter");
    const detailMicrocopy = document.querySelector(".detail-controls .microcopy");
    const detailEyebrow = document.querySelector("#detail-eyebrow");
    const detailTitle = document.querySelector("#detail-title");
    const detailDeck = document.querySelector("#detail-deck");
    const detailBinding = document.querySelector("#detail-binding");
    const detailFormat = document.querySelector("#detail-format");
    const detailTheme = document.querySelector("#detail-theme");
    const detailMotif = document.querySelector("#detail-motif");
    const liveRegion = document.querySelector("#live-region");
    const pointerLabel = document.querySelector("#pointer-label");
    const pointerLabelIndex = document.querySelector("#pointer-label-index");
    const pointerLabelTitle = document.querySelector("#pointer-label-title");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    loading.hidden = false;

    const clamp = THREE.MathUtils.clamp;
    const damp = THREE.MathUtils.damp;
    const lerp = THREE.MathUtils.lerp;
    const smoothstep = (value) => value * value * (3 - 2 * value);
    const smootherstep = (value) => (
      value * value * value * (value * (value * 6 - 15) + 10)
    );
    const mod = (value, length) => ((value % length) + length) % length;
    const pad = (value) => String(value).padStart(2, "0");

    let reducedMotion = reducedMotionQuery.matches;
    let renderer;
    let scene;
    let camera;
    let controls;
    let environmentTarget;
    let shelfStage;
    let bookRigs = [];
    let hitTargets = [];
    let rafId = 0;
    let lastTime = performance.now();
    let mode = "hero";
    let transitionTime = 0;
    let position = 0;
    let targetPosition = 0;
    let selectedIndex = 0;
    let hoveredIndex = -1;
    let wheelIdle = 0;
    let focusReturnTarget = inspectButton;
    let activeBook = null;
    let readingOpen = false;
    let detailBookHovered = false;
    let currentSpread = 0;
    let pointerDirty = false;
    let suspended = false;
    let viewWidth = window.innerWidth;
    let viewHeight = window.innerHeight;
    let detailViewOffsetX = 0;
    let currentViewOffsetX = 0;
    let detailSafeWidth = viewWidth * 0.6;
    let themeInitialized = false;
    let themeMoving = false;

    const roomMaterials = {
      floor: null,
      wall: null,
      shelf: null,
      shelfDark: null,
      shadow: null
    };
    const roomLights = {
      hemisphere: null,
      key: null,
      softKey: null,
      fill: null,
      rim: null,
      backFill: null,
      spineRake: null,
      pageRake: null
    };
    const themeTargets = {
      floor: new THREE.Color(0xd8c8aa),
      wall: new THREE.Color(0xe9dfcb),
      shelf: new THREE.Color(0x4a2b1d),
      shelfDark: new THREE.Color(0x2a170f),
      shadow: new THREE.Color(0x2f1d13),
      fog: new THREE.Color(0xe9dfcb),
      hemisphere: new THREE.Color(0xfff8e8),
      hemisphereGround: new THREE.Color(0x5b4030),
      key: new THREE.Color(0xffe8c2),
      fill: new THREE.Color(0xd8e3e7),
      rim: new THREE.Color(0xd5a45e)
    };

    const pointer = {
      ndc: new THREE.Vector2(3, 3),
      clientX: 0,
      clientY: 0
    };
    const pageDrag = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      progress: 0,
      peakProgress: 0,
      committed: false,
      progressVelocity: 0,
      verticalBias: 0,
      lastProgress: 0,
      lastTime: 0,
      direction: 0,
      kind: null
    };
    const detailPress = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      moved: false,
      allowClick: false
    };

    const raycaster = new THREE.Raycaster();
    const shelfCameraPosition = new THREE.Vector3();
    const shelfCameraTarget = new THREE.Vector3();
    const inspectPosition = new THREE.Vector3();
    const inspectCameraPosition = new THREE.Vector3();
    const inspectCameraTarget = new THREE.Vector3();
    const transitionCameraTarget = new THREE.Vector3();
    const openingBookPosition = new THREE.Vector3();
    const openingBookQuaternion = new THREE.Quaternion();
    const openingBookScale = new THREE.Vector3();
    const openingMotionPosition = new THREE.Vector3();
    const openingMotionQuaternion = new THREE.Quaternion();
    const restingMotionPosition = new THREE.Vector3();
    const restingMotionQuaternion = new THREE.Quaternion();
    const openingCameraPosition = new THREE.Vector3();
    const openingCameraTarget = new THREE.Vector3();
    const openingShelfPosition = new THREE.Vector3();
    const inspectShelfPosition = new THREE.Vector3(0, -4.2, -3);
    const inspectBookQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.055, -0.14, 0)
    );
    const inspectBookScale = new THREE.Vector3();
    const closingBookPosition = new THREE.Vector3();
    const closingBookStartPosition = new THREE.Vector3();
    const closingBookStartQuaternion = new THREE.Quaternion();
    const closingBookStartScale = new THREE.Vector3();
    const closingBookQuaternion = new THREE.Quaternion();
    const closingBookScale = new THREE.Vector3(1.09, 1.09, 1.09);
    const closingMotionPosition = new THREE.Vector3();
    const closingMotionQuaternion = new THREE.Quaternion();
    const closingCameraPosition = new THREE.Vector3();
    const closingCameraTarget = new THREE.Vector3();
    const closingShelfPosition = new THREE.Vector3();
    const shelfRestPosition = new THREE.Vector3();
    const scratchBox = new THREE.Box3();
    const scratchVector = new THREE.Vector3();
    const shelfBoardTop = 0.47;
    const spacing = 1.5;
    const PAGINATED_LEAF_COUNT = 4;
    const SPREAD_COUNT = PAGINATED_LEAF_COUNT + 1;
    const FLEXIBLE_PAGE_SEGMENTS = 18;
    const FLEXIBLE_PAGE_VERTICAL_SEGMENTS = 8;
    const PAGE_TURN_COMMIT_PROGRESS = 0.18;
    const COVER_OPEN_COMMIT_PROGRESS = 0.16;
    const COVER_CLOSE_COMMIT_PROGRESS = 0.2;
    const DETAIL_TRANSITION_DURATION = 0.92;
    const SHELF_TRANSITION_DURATION = 0.92;
    let openingViewOffsetX = 0;
    let closingViewOffsetX = 0;

    const shared = {
      box: new THREE.BoxGeometry(1, 1, 1),
      plane: new THREE.PlaneGeometry(1, 1),
      page: new THREE.MeshPhysicalMaterial({
        color: 0xe7dfcf,
        roughness: 0.95,
        metalness: 0,
        sheen: 0.025,
        sheenRoughness: 1
      }),
      pageSheet: new THREE.MeshPhysicalMaterial({
        color: 0xeee6d7,
        roughness: 0.955,
        metalness: 0,
        sheen: 0.02,
        sheenRoughness: 1,
        side: THREE.DoubleSide
      }),
      headband: new THREE.MeshPhysicalMaterial({
        color: 0xc6a66d,
        roughness: 0.58,
        metalness: 0.16,
        sheen: 0.14,
        sheenRoughness: 0.76
      }),
      walnut: new THREE.MeshStandardMaterial({
        color: 0x4a2b1d,
        roughness: 0.58,
        metalness: 0
      }),
      walnutDark: new THREE.MeshStandardMaterial({
        color: 0x2a170f,
        roughness: 0.7,
        metalness: 0
      })
    };

    function createFadeMaterial(baseMaterial) {
      const material = baseMaterial.clone();
      material.transparent = true;
      material.opacity = 1;
      return material;
    }

    function hashSeed(value) {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    function seededRandom(seed) {
      let value = seed >>> 0;
      return () => {
        value += 0x6d2b79f5;
        let result = value;
        result = Math.imul(result ^ (result >>> 15), result | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
      };
    }

    function drawMotif(ctx, book, width, height) {
      const foil = book.foil;
      ctx.save();
      ctx.strokeStyle = foil;
      ctx.fillStyle = foil;
      ctx.lineWidth = Math.max(3, width * 0.004);
      ctx.globalAlpha = 0.88;
      const centerX = width * 0.5;
      const centerY = height * 0.38;
      const size = Math.min(width, height) * 0.22;

      if (book.motifKey === "brackets") {
        for (let layer = 0; layer < 3; layer += 1) {
          const inset = layer * size * 0.22;
          const left = centerX - size + inset;
          const right = centerX + size - inset;
          const top = centerY - size * 0.72 + inset;
          const bottom = centerY + size * 0.72 - inset;
          ctx.beginPath();
          ctx.moveTo(left + size * 0.25, top);
          ctx.lineTo(left, top);
          ctx.lineTo(left, bottom);
          ctx.lineTo(left + size * 0.25, bottom);
          ctx.moveTo(right - size * 0.25, top);
          ctx.lineTo(right, top);
          ctx.lineTo(right, bottom);
          ctx.lineTo(right - size * 0.25, bottom);
          ctx.stroke();
        }
        ctx.fillRect(centerX - 3, centerY - 3, 6, 6);
      } else if (book.motifKey === "paths") {
        ctx.beginPath();
        ctx.moveTo(centerX - size, centerY + size * 0.35);
        ctx.bezierCurveTo(centerX - size * 0.2, centerY - size, centerX + size * 0.1, centerY + size, centerX + size, centerY - size * 0.25);
        ctx.stroke();
        ctx.globalAlpha = 0.52;
        ctx.beginPath();
        ctx.moveTo(centerX - size, centerY - size * 0.45);
        ctx.bezierCurveTo(centerX - size * 0.25, centerY + size, centerX + size * 0.3, centerY - size, centerX + size, centerY + size * 0.45);
        ctx.stroke();
        for (let point = -1; point <= 1; point += 1) {
          ctx.beginPath();
          ctx.arc(centerX + point * size, centerY - point * size * 0.25, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (book.motifKey === "caret") {
        ctx.beginPath();
        ctx.moveTo(centerX - size * 0.9, centerY + size * 0.6);
        ctx.lineTo(centerX, centerY - size * 0.65);
        ctx.lineTo(centerX + size * 0.9, centerY + size * 0.6);
        ctx.stroke();
        ctx.globalAlpha = 0.38;
        for (let line = -2; line <= 2; line += 1) {
          ctx.beginPath();
          ctx.moveTo(centerX - size, centerY + line * size * 0.28);
          ctx.lineTo(centerX + size, centerY + line * size * 0.28);
          ctx.stroke();
        }
      } else if (book.motifKey === "orbits") {
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, size, size * 0.42, -0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.58;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, size * 0.72, size, 0.52, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(centerX + size * 0.64, centerY - size * 0.34, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(centerX - 6, centerY - 6, 12, 12);
      } else if (book.motifKey === "modules") {
        const moduleSize = size * 0.54;
        const positions = [
          [-0.55, -0.5, "circle"],
          [0.25, -0.5, "rect"],
          [-0.55, 0.3, "rect"],
          [0.25, 0.3, "circle"]
        ];
        positions.forEach(([x, y, shape], index) => {
          ctx.globalAlpha = 0.45 + index * 0.12;
          if (shape === "circle") {
            ctx.beginPath();
            ctx.arc(centerX + x * size, centerY + y * size, moduleSize * 0.48, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.strokeRect(
              centerX + x * size - moduleSize * 0.5,
              centerY + y * size - moduleSize * 0.5,
              moduleSize,
              moduleSize
            );
          }
        });
      } else if (book.motifKey === "frames") {
        for (let layer = 0; layer < 4; layer += 1) {
          ctx.globalAlpha = 0.9 - layer * 0.17;
          const offset = layer * size * 0.18;
          ctx.strokeRect(
            centerX - size + offset,
            centerY - size * 0.7 + offset,
            size * 2 - offset * 2,
            size * 1.4 - offset * 2
          );
        }
        ctx.beginPath();
        ctx.moveTo(centerX - size, centerY - size * 0.7);
        ctx.lineTo(centerX + size, centerY + size * 0.7);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(centerX, centerY, size * 0.78, 0.15, Math.PI * 1.82);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX - size * 0.72, centerY + size * 0.88);
        ctx.lineTo(centerX, centerY - size * 0.92);
        ctx.lineTo(centerX + size * 0.72, centerY + size * 0.88);
        ctx.stroke();
        ctx.globalAlpha = 0.48;
        ctx.beginPath();
        ctx.moveTo(centerX - size, centerY);
        ctx.lineTo(centerX + size, centerY);
        ctx.stroke();
      }
      ctx.restore();
    }

    let sharedPaperFaceTexture = null;
    let sharedPageEdgeTextures = null;
    let sharedContactShadowTexture = null;

    function configureCanvasTexture(texture, {
      color = true,
      anisotropy = 16
    } = {}) {
      if (color) texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(
        anisotropy,
        renderer.capabilities.getMaxAnisotropy()
      );
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      return texture;
    }

    function makeCoverTexture(book) {
      const canvasTexture = document.createElement("canvas");
      canvasTexture.width = 768;
      canvasTexture.height = 1152;
      const ctx = canvasTexture.getContext("2d");

      if (coverAtlasReady) {
        const [sourceX, sourceY, sourceWidth, sourceHeight] = COVER_CROPS[BOOKS.indexOf(book)];
        ctx.drawImage(
          coverAtlasImage,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          canvasTexture.width,
          canvasTexture.height
        );

        const edgeShade = ctx.createLinearGradient(0, 0, canvasTexture.width, 0);
        edgeShade.addColorStop(0, "rgba(0,0,0,0.16)");
        edgeShade.addColorStop(0.055, "rgba(255,255,255,0.015)");
        edgeShade.addColorStop(0.93, "rgba(255,255,255,0)");
        edgeShade.addColorStop(1, "rgba(0,0,0,0.1)");
        ctx.fillStyle = edgeShade;
        ctx.fillRect(0, 0, canvasTexture.width, canvasTexture.height);

        return configureCanvasTexture(new THREE.CanvasTexture(canvasTexture));
      }

      const random = seededRandom(hashSeed(book.id) + book.seed);

      ctx.fillStyle = book.color;
      ctx.fillRect(0, 0, canvasTexture.width, canvasTexture.height);

      const edge = ctx.createLinearGradient(0, 0, canvasTexture.width, 0);
      edge.addColorStop(0, "rgba(0,0,0,0.24)");
      edge.addColorStop(0.075, "rgba(255,255,255,0.035)");
      edge.addColorStop(0.5, "rgba(255,255,255,0.01)");
      edge.addColorStop(0.94, "rgba(0,0,0,0.06)");
      edge.addColorStop(1, "rgba(0,0,0,0.19)");
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, canvasTexture.width, canvasTexture.height);

      for (let line = 0; line < 1250; line += 1) {
        const x = random() * canvasTexture.width;
        const y = random() * canvasTexture.height;
        const length = 4 + random() * 22;
        ctx.strokeStyle = random() > 0.5 ? "rgba(255,255,255,0.024)" : "rgba(0,0,0,0.025)";
        ctx.lineWidth = 0.6 + random() * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + length, y + (random() - 0.5) * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = book.foil;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 2;
      ctx.strokeRect(42, 42, canvasTexture.width - 84, canvasTexture.height - 84);
      ctx.strokeRect(55, 55, canvasTexture.width - 110, canvasTexture.height - 110);
      ctx.globalAlpha = 1;

      drawMotif(ctx, book, canvasTexture.width, canvasTexture.height);

      ctx.fillStyle = book.foil;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '500 18px Inter, "Helvetica Neue", Arial, sans-serif';
      ctx.letterSpacing = "4px";
      ctx.fillText(`IC3 GS6  /  ${book.roman}`, canvasTexture.width / 2, 92);

      const titleSize = book.title.length > 10 ? 72 : 88;
      ctx.font = `400 ${titleSize}px "Iowan Old Style", Baskerville, Georgia, serif`;
      ctx.fillText(book.title, canvasTexture.width / 2, canvasTexture.height * 0.72);
      ctx.font = '500 16px Inter, "Helvetica Neue", Arial, sans-serif';
      ctx.fillText(book.discipline.toUpperCase(), canvasTexture.width / 2, canvasTexture.height * 0.79);

      return configureCanvasTexture(new THREE.CanvasTexture(canvasTexture));
    }

    function makeFoilTexture(book) {
      const foilCanvas = document.createElement("canvas");
      foilCanvas.width = 768;
      foilCanvas.height = 1152;
      const ctx = foilCanvas.getContext("2d");
      const index = BOOKS.indexOf(book) + 1;

      ctx.clearRect(0, 0, foilCanvas.width, foilCanvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      ctx.font = '500 15px Inter, "Helvetica Neue", Arial, sans-serif';
      ctx.letterSpacing = "2.8px";
      ctx.fillText(`IC3 GS6  /  ${pad(index)}`, 58, 70);
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(58, 86);
      ctx.lineTo(164, 86);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const titleSize = book.title.length > 10 ? 64 : 78;
      ctx.font = `400 ${titleSize}px "Iowan Old Style", Baskerville, Georgia, serif`;
      ctx.fillText(book.title, 58, 1020);
      ctx.font = '500 14px Inter, "Helvetica Neue", Arial, sans-serif';
      ctx.letterSpacing = "2.4px";
      ctx.fillText(book.discipline.toUpperCase(), 60, 1066);

      return configureCanvasTexture(new THREE.CanvasTexture(foilCanvas));
    }

    function makeClothBumpTexture(book) {
      const bumpCanvas = document.createElement("canvas");
      bumpCanvas.width = 256;
      bumpCanvas.height = 256;
      const ctx = bumpCanvas.getContext("2d");
      const random = seededRandom(hashSeed(`${book.id}-cloth`) + book.seed);

      ctx.fillStyle = "#7f7f7f";
      ctx.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);

      for (let line = 0; line < 256; line += 2) {
        const value = Math.round(98 + random() * 70);
        ctx.strokeStyle = `rgb(${value},${value},${value})`;
        ctx.globalAlpha = 0.34 + random() * 0.18;
        ctx.lineWidth = 0.65 + random() * 0.45;
        ctx.beginPath();
        ctx.moveTo(0, line + (random() - 0.5));
        ctx.lineTo(256, line + (random() - 0.5));
        ctx.stroke();
      }

      for (let line = 1; line < 256; line += 3) {
        const value = Math.round(105 + random() * 58);
        ctx.strokeStyle = `rgb(${value},${value},${value})`;
        ctx.globalAlpha = 0.25 + random() * 0.14;
        ctx.lineWidth = 0.55 + random() * 0.35;
        ctx.beginPath();
        ctx.moveTo(line + (random() - 0.5), 0);
        ctx.lineTo(line + (random() - 0.5), 256);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      const texture = new THREE.CanvasTexture(bumpCanvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(5, 8);
      return configureCanvasTexture(texture, {
        color: false,
        anisotropy: 12
      });
    }

    function makeClothSurfaceMaps(book) {
      const size = 256;
      const heightField = new Float32Array(size * size);
      const normalCanvas = document.createElement("canvas");
      const roughnessCanvas = document.createElement("canvas");
      normalCanvas.width = roughnessCanvas.width = size;
      normalCanvas.height = roughnessCanvas.height = size;
      const normalContext = normalCanvas.getContext("2d");
      const roughnessContext = roughnessCanvas.getContext("2d");
      const normalImage = normalContext.createImageData(size, size);
      const roughnessImage = roughnessContext.createImageData(size, size);
      const phase = (book.seed % 19) * 0.23;

      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const warp = Math.sin((x + phase) * Math.PI * 0.52);
          const weft = Math.sin((y - phase) * Math.PI * 0.41);
          const cross = Math.sin((x + y + phase) * Math.PI * 0.19);
          heightField[y * size + x] = 0.5 + warp * 0.18 + weft * 0.15 + cross * 0.045;
        }
      }

      const sampleHeight = (x, y) => {
        const wrappedX = (x + size) % size;
        const wrappedY = (y + size) % size;
        return heightField[wrappedY * size + wrappedX];
      };

      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const index = y * size + x;
          const pixel = index * 4;
          const dx = (sampleHeight(x + 1, y) - sampleHeight(x - 1, y)) * 1.5;
          const dy = (sampleHeight(x, y + 1) - sampleHeight(x, y - 1)) * 1.5;
          const length = Math.hypot(dx, dy, 1);
          normalImage.data[pixel] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
          normalImage.data[pixel + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255);
          normalImage.data[pixel + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
          normalImage.data[pixel + 3] = 255;

          const roughness = Math.round(188 + heightField[index] * 56);
          roughnessImage.data[pixel] = roughness;
          roughnessImage.data[pixel + 1] = roughness;
          roughnessImage.data[pixel + 2] = roughness;
          roughnessImage.data[pixel + 3] = 255;
        }
      }

      normalContext.putImageData(normalImage, 0, 0);
      roughnessContext.putImageData(roughnessImage, 0, 0);

      const configureWeaveMap = (canvas, suffix) => {
        const texture = new THREE.CanvasTexture(canvas);
        texture.name = `${book.id}-${suffix}`;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(5, 8);
        return configureCanvasTexture(texture, {
          color: false,
          anisotropy: 12
        });
      };

      return {
        normal: configureWeaveMap(normalCanvas, "cloth-normal"),
        roughness: configureWeaveMap(roughnessCanvas, "cloth-roughness")
      };
    }

    function makeEmbossMap(sourceTexture, name) {
      const texture = new THREE.CanvasTexture(sourceTexture.image);
      texture.name = name;
      texture.wrapS = sourceTexture.wrapS;
      texture.wrapT = sourceTexture.wrapT;
      texture.repeat.copy(sourceTexture.repeat);
      texture.offset.copy(sourceTexture.offset);
      texture.center.copy(sourceTexture.center);
      texture.rotation = sourceTexture.rotation;
      return configureCanvasTexture(texture, {
        color: false,
        anisotropy: 16
      });
    }

    function drawPaperSurface(ctx, width, height, random) {
      ctx.fillStyle = "#e8e1d3";
      ctx.fillRect(0, 0, width, height);

      const paperWash = ctx.createLinearGradient(0, 0, width, height);
      paperWash.addColorStop(0, "rgba(255,255,255,0.22)");
      paperWash.addColorStop(0.42, "rgba(255,255,255,0.035)");
      paperWash.addColorStop(1, "rgba(103,87,64,0.08)");
      ctx.fillStyle = paperWash;
      ctx.fillRect(0, 0, width, height);

      for (let fiber = 0; fiber < 2400; fiber += 1) {
        const x = random() * width;
        const y = random() * height;
        const length = 5 + random() * 34;
        const lightFiber = random() > 0.44;
        ctx.strokeStyle = lightFiber
          ? `rgba(255,255,255,${0.025 + random() * 0.045})`
          : `rgba(92,76,55,${0.018 + random() * 0.035})`;
        ctx.lineWidth = 0.45 + random() * 0.65;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          Math.min(width, x + length),
          y + (random() - 0.5) * 2.2
        );
        ctx.stroke();
      }

      for (let fleck = 0; fleck < 1200; fleck += 1) {
        const tone = Math.round(112 + random() * 94);
        ctx.fillStyle = `rgba(${tone},${tone - 5},${tone - 13},${0.016 + random() * 0.025})`;
        const size = 0.5 + random() * 1.1;
        ctx.fillRect(random() * width, random() * height, size, size);
      }
    }

    function makePaperFaceTexture(book, printed = false) {
      if (!printed && sharedPaperFaceTexture) return sharedPaperFaceTexture;

      const paperCanvas = document.createElement("canvas");
      paperCanvas.width = 768;
      paperCanvas.height = 1152;
      const ctx = paperCanvas.getContext("2d");
      const random = seededRandom(printed
        ? hashSeed(`${book.id}-printed-page`) + book.seed
        : hashSeed("working-volumes-paper-stock"));

      drawPaperSurface(ctx, paperCanvas.width, paperCanvas.height, random);

      if (printed) {
        const ink = new THREE.Color(book.palette.ink);
        const red = Math.round(ink.r * 255);
        const green = Math.round(ink.g * 255);
        const blue = Math.round(ink.b * 255);
        ctx.fillStyle = `rgba(${red},${green},${blue},0.2)`;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.font = '500 15px Inter, "Helvetica Neue", Arial, sans-serif';
        ctx.letterSpacing = "2px";
        ctx.fillText(book.title.toUpperCase(), 84, 98);
        ctx.fillRect(84, 121, 190, 2);

        for (let column = 0; column < 2; column += 1) {
          const left = 84 + column * 316;
          for (let line = 0; line < 34; line += 1) {
            const y = 184 + line * 23;
            const lastInParagraph = line % 7 === 6;
            const lineWidth = lastInParagraph
              ? 108 + random() * 86
              : 190 + random() * 72;
            ctx.globalAlpha = 0.22 + random() * 0.11;
            ctx.fillRect(left, y, lineWidth, 1.45);
          }
        }

        ctx.globalAlpha = 0.32;
        ctx.font = '400 17px "Iowan Old Style", Baskerville, Georgia, serif';
        ctx.fillText(book.roman, paperCanvas.width - 104, paperCanvas.height - 72);
        ctx.globalAlpha = 1;
      }

      const texture = configureCanvasTexture(new THREE.CanvasTexture(paperCanvas));
      if (!printed) sharedPaperFaceTexture = texture;
      return texture;
    }

    function drawWrappedCanvasText(ctx, text, x, y, maxCharacters, lineHeight, maxLines = 6) {
      const words = text.split(/\s+/);
      let line = "";
      let lineIndex = 0;

      words.forEach((word) => {
        if (lineIndex >= maxLines) return;
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length > maxCharacters && line) {
          ctx.fillText(line, x, y + lineIndex * lineHeight);
          line = word;
          lineIndex += 1;
        } else {
          line = candidate;
        }
      });

      if (line && lineIndex < maxLines) {
        ctx.fillText(line, x, y + lineIndex * lineHeight);
      }
    }

    function makeEndpaperTexture(book) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 768;
      const ctx = canvas.getContext("2d");
      const random = seededRandom(hashSeed(`${book.id}-endpaper`) + book.seed);
      drawPaperSurface(ctx, canvas.width, canvas.height, random);

      ctx.save();
      ctx.fillStyle = book.color;
      ctx.globalAlpha = 0.14;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = book.foil;
      ctx.lineWidth = 1;
      for (let x = 28; x < canvas.width; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 24; y < canvas.height; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.42;
      drawMotif(ctx, { ...book, foil: book.palette.inkSoft }, canvas.width, canvas.height);
      ctx.restore();

      const texture = configureCanvasTexture(new THREE.CanvasTexture(canvas), {
        anisotropy: 16
      });
      texture.name = `${book.id}-patterned-endpaper`;
      return texture;
    }

    function makeInteriorPageTextures(book) {
      const pageCount = 8;
      const inkColor = new THREE.Color(book.color).lerp(new THREE.Color(0x211b16), 0.62);
      const ink = `#${inkColor.getHexString()}`;

      return Array.from({ length: pageCount }, (_, pageIndex) => {
        const canvas = document.createElement("canvas");
        const logicalWidth = 512;
        const logicalHeight = 768;
        canvas.width = 384;
        canvas.height = 576;
        const ctx = canvas.getContext("2d");
        ctx.scale(0.75, 0.75);
        const random = seededRandom(hashSeed(`${book.id}-leaf-${pageIndex}`) + book.seed);
        drawPaperSurface(ctx, logicalWidth, logicalHeight, random);
        ctx.fillStyle = ink;
        ctx.strokeStyle = ink;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";

        ctx.globalAlpha = 0.58;
        ctx.font = '500 10px Inter, "Helvetica Neue", Arial, sans-serif';
        ctx.letterSpacing = "1.8px";
        ctx.fillText(`IC3 GS6  /  ${book.roman}`, 48, 48);
        ctx.textAlign = "right";
        ctx.fillText(pad(pageIndex + 1), logicalWidth - 48, 48);
        ctx.textAlign = "left";
        ctx.fillRect(48, 64, logicalWidth - 96, 1);
        ctx.globalAlpha = 1;

        if (pageIndex === 0) {
          ctx.font = '500 12px Inter, "Helvetica Neue", Arial, sans-serif';
          ctx.letterSpacing = "2.3px";
          ctx.fillText(book.discipline.toUpperCase(), 54, 174);
          ctx.font = `400 ${book.title.length > 10 ? 48 : 58}px "Iowan Old Style", Baskerville, Georgia, serif`;
          ctx.letterSpacing = "0px";
          drawWrappedCanvasText(ctx, book.title, 52, 246, 18, 58, 2);
          ctx.globalAlpha = 0.55;
          ctx.font = '400 22px "Iowan Old Style", Baskerville, Georgia, serif';
          drawWrappedCanvasText(ctx, book.note, 54, 462, 36, 30, 4);
        } else if (pageIndex === 1 || pageIndex === 3) {
          const chapterIndex = pageIndex === 1 ? 0 : 1;
          ctx.font = '500 11px Inter, "Helvetica Neue", Arial, sans-serif';
          ctx.letterSpacing = "2px";
          ctx.fillText(`CHAPTER ${pad(chapterIndex + 1)}`, 54, 166);
          ctx.font = '400 49px "Iowan Old Style", Baskerville, Georgia, serif';
          ctx.letterSpacing = "0px";
          drawWrappedCanvasText(ctx, book.chapters[chapterIndex], 52, 244, 18, 54, 3);
          ctx.globalAlpha = 0.52;
          ctx.font = '400 20px "Iowan Old Style", Baskerville, Georgia, serif';
          drawWrappedCanvasText(
            ctx,
            chapterIndex === 0 ? book.note : book.deck,
            54,
            438,
            42,
            28,
            6
          );
        } else if (pageIndex === 2) {
          ctx.font = '500 11px Inter, "Helvetica Neue", Arial, sans-serif';
          ctx.letterSpacing = "2px";
          ctx.fillText("PLATE 01  /  SYSTEM MOTIF", 54, 146);
          ctx.save();
          ctx.globalAlpha = 0.58;
          drawMotif(ctx, { ...book, foil: ink }, logicalWidth, logicalHeight * 0.92);
          ctx.restore();
          ctx.globalAlpha = 0.48;
          ctx.font = '400 17px "Iowan Old Style", Baskerville, Georgia, serif';
          drawWrappedCanvasText(ctx, book.theme, 54, 650, 44, 24, 3);
        } else if (pageIndex === 4) {
          ctx.font = '500 11px Inter, "Helvetica Neue", Arial, sans-serif';
          ctx.letterSpacing = "2px";
          ctx.fillText(`NOTES  /  ${book.chapters[1].toUpperCase()}`, 54, 138);
          ctx.globalAlpha = 0.44;
          for (let column = 0; column < 2; column += 1) {
            const left = 54 + column * 214;
            for (let line = 0; line < 24; line += 1) {
              const width = line % 7 === 6 ? 72 + random() * 54 : 138 + random() * 44;
              ctx.fillRect(left, 190 + line * 18, width, 1.25);
            }
          }
          ctx.globalAlpha = 0.78;
          ctx.strokeRect(54, 654, 404, 54);
          ctx.font = '500 10px Inter, "Helvetica Neue", Arial, sans-serif';
          ctx.letterSpacing = "1.4px";
          ctx.fillText(book.motif.toUpperCase(), 70, 686);
        } else if (pageIndex === 5) {
          ctx.font = '500 11px Inter, "Helvetica Neue", Arial, sans-serif';
          ctx.letterSpacing = "2px";
          ctx.fillText("CHAPTER 03", 54, 166);
          ctx.font = '400 49px "Iowan Old Style", Baskerville, Georgia, serif';
          ctx.letterSpacing = "0px";
          drawWrappedCanvasText(ctx, book.chapters[2], 52, 244, 18, 54, 3);
          ctx.globalAlpha = 0.52;
          ctx.font = '400 20px "Iowan Old Style", Baskerville, Georgia, serif';
          drawWrappedCanvasText(ctx, book.deck, 54, 438, 42, 28, 6);
        } else if (pageIndex === 6) {
          ctx.font = '500 11px Inter, "Helvetica Neue", Arial, sans-serif';
          ctx.letterSpacing = "2px";
          ctx.fillText("PLATE 02  /  TECHNICAL SYSTEM", 54, 146);
          ctx.save();
          ctx.translate(logicalWidth * 0.5, 380);
          ctx.globalAlpha = 0.55;
          for (let ring = 0; ring < 5; ring += 1) {
            const radius = 38 + ring * 34;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();
          }
          for (let spoke = 0; spoke < 8; spoke += 1) {
            const angle = spoke * Math.PI * 0.25;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * 36, Math.sin(angle) * 36);
            ctx.lineTo(Math.cos(angle) * 176, Math.sin(angle) * 176);
            ctx.stroke();
          }
          ctx.restore();
          ctx.globalAlpha = 0.48;
          ctx.font = '400 17px "Iowan Old Style", Baskerville, Georgia, serif';
          drawWrappedCanvasText(ctx, book.theme, 54, 650, 44, 24, 3);
        } else {
          ctx.font = '500 11px Inter, "Helvetica Neue", Arial, sans-serif';
          ctx.letterSpacing = "2px";
          ctx.fillText("COLOPHON", 54, 164);
          ctx.font = '400 32px "Iowan Old Style", Baskerville, Georgia, serif';
          ctx.letterSpacing = "0px";
          ctx.fillText(book.title, 54, 230);
          ctx.globalAlpha = 0.58;
          ctx.font = '400 18px "Iowan Old Style", Baskerville, Georgia, serif';
          drawWrappedCanvasText(
            ctx,
            `${book.binding}. ${book.format}. Part of the IC3 GS6 seven field guides for learners.`,
            54,
            306,
            44,
            28,
            7
          );
          ctx.globalAlpha = 0.74;
          ctx.font = '500 10px Inter, "Helvetica Neue", Arial, sans-serif';
          ctx.letterSpacing = "1.8px";
          ctx.fillText(`SPECIMEN ${book.roman} / ${book.seed}  ·  IMAGINED EDITION`, 54, 676);
        }

        ctx.globalAlpha = 0.62;
        ctx.fillRect(48, logicalHeight - 48, logicalWidth - 96, 1);
        ctx.globalAlpha = 1;
        const texture = configureCanvasTexture(new THREE.CanvasTexture(canvas), {
          anisotropy: 16
        });
        texture.name = `${book.id}-interior-page-${pageIndex + 1}`;
        return texture;
      });
    }

    function makeContactShadowTexture() {
      if (sharedContactShadowTexture) return sharedContactShadowTexture;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createRadialGradient(256, 64, 10, 256, 64, 254);
      gradient.addColorStop(0, "rgba(255,255,255,0.95)");
      gradient.addColorStop(0.38, "rgba(255,255,255,0.62)");
      gradient.addColorStop(0.72, "rgba(255,255,255,0.18)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      sharedContactShadowTexture = configureCanvasTexture(
        new THREE.CanvasTexture(canvas),
        { color: false, anisotropy: 8 }
      );
      sharedContactShadowTexture.name = "soft-contact-shadow";
      return sharedContactShadowTexture;
    }

    function makePageEdgeTextures(book) {
      if (sharedPageEdgeTextures) return sharedPageEdgeTextures;

      const makeEdgeTexture = (width, height, suffix) => {
        const edgeCanvas = document.createElement("canvas");
        edgeCanvas.width = width;
        edgeCanvas.height = height;
        const ctx = edgeCanvas.getContext("2d");
        const random = seededRandom(
          hashSeed(`${book.id}-${suffix}`) + book.seed
        );

        ctx.fillStyle = "#dcd5c7";
        ctx.fillRect(0, 0, width, height);

        const pageStep = suffix === "fore-edge" ? 2 : 1.35;
        for (let y = 0; y < height; y += pageStep) {
          const shade = Math.round(106 + random() * 74);
          const signature = random() > 0.965;
          ctx.strokeStyle = `rgba(${shade},${shade - 3},${shade - 9},${signature ? 0.34 : 0.13 + random() * 0.13})`;
          ctx.lineWidth = signature ? 1.05 : 0.42 + random() * 0.42;
          ctx.beginPath();
          ctx.moveTo(0, y + (random() - 0.5) * 0.5);
          ctx.bezierCurveTo(
            width * 0.3,
            y + (random() - 0.5) * 0.9,
            width * 0.72,
            y + (random() - 0.5) * 0.9,
            width,
            y + (random() - 0.5) * 0.5
          );
          ctx.stroke();
        }

        const edgeShade = ctx.createLinearGradient(0, 0, width, 0);
        edgeShade.addColorStop(0, "rgba(58,48,35,0.18)");
        edgeShade.addColorStop(0.035, "rgba(255,255,255,0.04)");
        edgeShade.addColorStop(0.86, "rgba(255,255,255,0)");
        edgeShade.addColorStop(1, "rgba(58,48,35,0.12)");
        ctx.fillStyle = edgeShade;
        ctx.fillRect(0, 0, width, height);

        return configureCanvasTexture(new THREE.CanvasTexture(edgeCanvas));
      };

      sharedPageEdgeTextures = {
        fore: makeEdgeTexture(512, 2048, "fore-edge"),
        headTail: makeEdgeTexture(2048, 384, "head-tail-edge")
      };
      return sharedPageEdgeTextures;
    }

    function createRoundedPlaneGeometry(width, height, radius) {
      const halfWidth = width * 0.5;
      const halfHeight = height * 0.5;
      const corner = Math.min(radius, halfWidth, halfHeight);
      const shape = new THREE.Shape();

      shape.moveTo(-halfWidth + corner, -halfHeight);
      shape.lineTo(halfWidth - corner, -halfHeight);
      shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + corner);
      shape.lineTo(halfWidth, halfHeight - corner);
      shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - corner, halfHeight);
      shape.lineTo(-halfWidth + corner, halfHeight);
      shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - corner);
      shape.lineTo(-halfWidth, -halfHeight + corner);
      shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + corner, -halfHeight);

      const geometry = new THREE.ShapeGeometry(shape, 8);
      const position = geometry.getAttribute("position");
      const uv = new Float32Array(position.count * 2);
      for (let index = 0; index < position.count; index += 1) {
        uv[index * 2] = (position.getX(index) + halfWidth) / width;
        uv[index * 2 + 1] = (position.getY(index) + halfHeight) / height;
      }
      geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geometry.computeVertexNormals();
      return geometry;
    }

    function createPageBlockGeometry(width, height, depth, radius) {
      const geometry = new RoundedBoxGeometry(width, height, depth, 4, radius);
      const position = geometry.getAttribute("position");
      const halfWidth = width * 0.5;

      for (let index = 0; index < position.count; index += 1) {
        const x = position.getX(index);
        const z = position.getZ(index);
        const normalizedX = clamp((x + halfWidth) / width, 0, 1);
        const gutterProgress = clamp(normalizedX / 0.16, 0, 1);
        const gutterEase = gutterProgress * gutterProgress * (3 - 2 * gutterProgress);
        const gutterCompression = (1 - gutterEase) * 0.012;
        const foreEdgeCharacter = Math.pow(normalizedX, 8) * Math.sin(position.getY(index) * 31) * 0.00055;
        const adjustedZ = Math.sign(z || 1) * Math.max(
          0,
          Math.abs(z) - gutterCompression + foreEdgeCharacter
        );
        position.setZ(index, adjustedZ);
      }

      position.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometry.userData.gutterCompression = 0.012;
      geometry.userData.pageSignatures = 6;
      return geometry;
    }

    function makeSpineTexture(book) {
      const spineCanvas = document.createElement("canvas");
      spineCanvas.width = 384;
      spineCanvas.height = 1536;
      const ctx = spineCanvas.getContext("2d");
      const random = seededRandom(hashSeed(`${book.id}-spine-cloth`) + book.seed);
      ctx.fillStyle = book.color;
      ctx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);

      const shade = ctx.createLinearGradient(0, 0, spineCanvas.width, 0);
      shade.addColorStop(0, "rgba(0,0,0,0.2)");
      shade.addColorStop(0.14, "rgba(255,255,255,0.055)");
      shade.addColorStop(0.62, "rgba(255,255,255,0.012)");
      shade.addColorStop(1, "rgba(0,0,0,0.16)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);

      for (let thread = 0; thread < 1900; thread += 1) {
        const x = random() * spineCanvas.width;
        const y = random() * spineCanvas.height;
        const vertical = random() > 0.42;
        ctx.strokeStyle = random() > 0.5
          ? `rgba(255,255,255,${0.018 + random() * 0.038})`
          : `rgba(0,0,0,${0.018 + random() * 0.032})`;
        ctx.lineWidth = 0.45 + random() * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          vertical ? x + (random() - 0.5) * 1.2 : x + 8 + random() * 28,
          vertical ? y + 8 + random() * 34 : y + (random() - 0.5) * 1.2
        );
        ctx.stroke();
      }

      const bottomShade = ctx.createLinearGradient(
        0,
        spineCanvas.height * 0.82,
        0,
        spineCanvas.height
      );
      bottomShade.addColorStop(0, "rgba(0,0,0,0)");
      bottomShade.addColorStop(1, "rgba(0,0,0,0.12)");
      ctx.fillStyle = bottomShade;
      ctx.fillRect(0, 0, spineCanvas.width, spineCanvas.height);

      return configureCanvasTexture(
        new THREE.CanvasTexture(spineCanvas),
        { anisotropy: 16 }
      );
    }

    function makeSpineFoilTexture(book) {
      const foilCanvas = document.createElement("canvas");
      foilCanvas.width = 384;
      foilCanvas.height = 1536;
      const ctx = foilCanvas.getContext("2d");

      ctx.clearRect(0, 0, foilCanvas.width, foilCanvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.4;
      ctx.strokeRect(34, 38, foilCanvas.width - 68, foilCanvas.height - 76);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '500 24px Inter, "Helvetica Neue", Arial, sans-serif';
      ctx.letterSpacing = "5px";
      ctx.fillText(book.roman, foilCanvas.width * 0.5, 118);

      ctx.save();
      ctx.translate(foilCanvas.width * 0.5, foilCanvas.height * 0.5);
      ctx.rotate(Math.PI / 2);
      ctx.font = `400 ${book.title.length > 10 ? 58 : 68}px "Iowan Old Style", Baskerville, Georgia, serif`;
      ctx.letterSpacing = "0px";
      ctx.fillText(book.title, 0, 0);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(foilCanvas.width * 0.5, foilCanvas.height - 120, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(foilCanvas.width * 0.5 - 24, foilCanvas.height - 120);
      ctx.lineTo(foilCanvas.width * 0.5 + 24, foilCanvas.height - 120);
      ctx.stroke();

      return configureCanvasTexture(new THREE.CanvasTexture(foilCanvas));
    }

    function makeBackCoverTexture(book) {
      const backCanvas = document.createElement("canvas");
      backCanvas.width = 768;
      backCanvas.height = 1152;
      const ctx = backCanvas.getContext("2d");
      const random = seededRandom(hashSeed(`${book.id}-back-cloth`) + book.seed);

      ctx.fillStyle = book.color;
      ctx.fillRect(0, 0, backCanvas.width, backCanvas.height);

      const edgeShade = ctx.createLinearGradient(0, 0, backCanvas.width, 0);
      edgeShade.addColorStop(0, "rgba(0,0,0,0.15)");
      edgeShade.addColorStop(0.05, "rgba(255,255,255,0.028)");
      edgeShade.addColorStop(0.84, "rgba(255,255,255,0)");
      edgeShade.addColorStop(1, "rgba(0,0,0,0.11)");
      ctx.fillStyle = edgeShade;
      ctx.fillRect(0, 0, backCanvas.width, backCanvas.height);

      for (let thread = 0; thread < 2600; thread += 1) {
        const x = random() * backCanvas.width;
        const y = random() * backCanvas.height;
        const length = 5 + random() * 30;
        ctx.strokeStyle = random() > 0.5
          ? `rgba(255,255,255,${0.018 + random() * 0.03})`
          : `rgba(0,0,0,${0.016 + random() * 0.028})`;
        ctx.lineWidth = 0.45 + random() * 0.65;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + length, y + (random() - 0.5) * 1.5);
        ctx.stroke();
      }

      const vignette = ctx.createRadialGradient(
        backCanvas.width * 0.62,
        backCanvas.height * 0.38,
        20,
        backCanvas.width * 0.62,
        backCanvas.height * 0.38,
        backCanvas.width * 0.75
      );
      vignette.addColorStop(0, "rgba(255,255,255,0.03)");
      vignette.addColorStop(1, "rgba(0,0,0,0.09)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, backCanvas.width, backCanvas.height);

      return configureCanvasTexture(new THREE.CanvasTexture(backCanvas));
    }

    function makeBackFoilTexture(book) {
      const foilCanvas = document.createElement("canvas");
      foilCanvas.width = 768;
      foilCanvas.height = 1152;
      const ctx = foilCanvas.getContext("2d");

      ctx.clearRect(0, 0, foilCanvas.width, foilCanvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      ctx.font = '500 16px Inter, "Helvetica Neue", Arial, sans-serif';
      ctx.letterSpacing = "3px";
      ctx.fillText(`IC3 GS6  /  ${book.roman}`, 68, 82);
      ctx.globalAlpha = 0.72;
      ctx.fillRect(68, 108, 176, 2);
      ctx.globalAlpha = 1;

      ctx.lineWidth = 1.5;
      for (let ring = 0; ring < 5; ring += 1) {
        ctx.globalAlpha = 0.24 - ring * 0.032;
        ctx.beginPath();
        ctx.arc(548, 374, 74 + ring * 38, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(348, 374);
      ctx.lineTo(704, 374);
      ctx.moveTo(548, 174);
      ctx.lineTo(548, 574);
      ctx.stroke();

      ctx.font = `400 ${book.title.length > 10 ? 52 : 62}px "Iowan Old Style", Baskerville, Georgia, serif`;
      ctx.letterSpacing = "0px";
      ctx.fillText(book.title, 68, 956);
      ctx.font = '500 15px Inter, "Helvetica Neue", Arial, sans-serif';
      ctx.letterSpacing = "2.6px";
      ctx.fillText(book.discipline.toUpperCase(), 70, 1004);
      ctx.globalAlpha = 0.68;
      ctx.fillRect(68, 1040, 632, 1.5);
      ctx.globalAlpha = 1;
      ctx.textAlign = "right";
      ctx.fillText("AN IMAGINED EDITION", 700, 1080);

      return configureCanvasTexture(new THREE.CanvasTexture(foilCanvas));
    }

    function createMesh(geometry, material, name, cast = true, receive = true) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      return mesh;
    }

    function addTurnIns(pivot, book, side, width, height, insideZ, material) {
      const stripDepth = 0.002;
      const border = 0.018;
      const longWidth = width - border * 0.7;
      const longHeight = height - border * 2.2;
      const definitions = [
        ["head", width * 0.5, height * 0.5 - border * 0.56, longWidth, border, stripDepth],
        ["tail", width * 0.5, -height * 0.5 + border * 0.56, longWidth, border, stripDepth],
        ["spine", border * 0.56, 0, border, longHeight, stripDepth],
        ["fore", width - border * 0.56, 0, border, longHeight, stripDepth]
      ];

      definitions.forEach(([edge, x, y, stripWidth, stripHeight, depth]) => {
        const strip = createMesh(
          shared.box,
          material,
          `${book.id}-${side}-turn-in-${edge}`,
          false,
          true
        );
        strip.scale.set(stripWidth, stripHeight, depth);
        strip.position.set(x, y, insideZ);
        pivot.add(strip);
      });
    }

    function createBookRig(book, index) {
      const root = new THREE.Group();
      root.name = `book-${book.id}`;
      root.userData.index = index;

      const motion = new THREE.Group();
      motion.name = `${book.id}-motion`;
      root.add(motion);

      const width = book.width;
      const height = book.height;
      const depth = book.depth;
      const board = 0.032;
      const coverRadius = 0.0045;
      const pageRadius = 0.0025;
      const spineRadius = 0.0015;
      const spineBoardThickness = 0.014;
      const spineWidth = 0.082;
      const pageWidth = width - 0.074;
      const pageHeight = height - 0.068;
      const pageDepth = depth - 0.026;

      const coverTexture = makeCoverTexture(book);
      const foilTexture = makeFoilTexture(book);
      const clothBumpTexture = makeClothBumpTexture(book);
      const clothSurfaceMaps = makeClothSurfaceMaps(book);
      const paperFaceTexture = makePaperFaceTexture(book);
      const interiorPageTextures = makeInteriorPageTextures(book);
      const endpaperTexture = makeEndpaperTexture(book);
      const pageEdgeTextures = makePageEdgeTextures(book);
      const spineTexture = makeSpineTexture(book);
      const spineFoilTexture = makeSpineFoilTexture(book);
      const backCoverTexture = makeBackCoverTexture(book);
      const backFoilTexture = makeBackFoilTexture(book);
      const foilEmbossTexture = makeEmbossMap(foilTexture, `${book.id}-front-foil-emboss`);
      const spineEmbossTexture = makeEmbossMap(spineFoilTexture, `${book.id}-spine-foil-emboss`);
      const backEmbossTexture = makeEmbossMap(backFoilTexture, `${book.id}-back-foil-emboss`);
      const cloth = new THREE.MeshPhysicalMaterial({
        color: book.color,
        normalMap: clothSurfaceMaps.normal,
        normalScale: new THREE.Vector2(0.34, 0.34),
        roughnessMap: clothSurfaceMaps.roughness,
        roughness: 0.98,
        metalness: 0.02,
        bumpMap: clothBumpTexture,
        bumpScale: 0.0045,
        sheen: 0.34,
        sheenRoughness: 0.76,
        sheenColor: new THREE.Color(book.foil),
        transparent: true
      });
      const coverArt = new THREE.MeshPhysicalMaterial({
        map: coverTexture,
        normalMap: clothSurfaceMaps.normal,
        normalScale: new THREE.Vector2(0.28, 0.28),
        roughnessMap: clothSurfaceMaps.roughness,
        bumpMap: clothBumpTexture,
        bumpScale: 0.0035,
        roughness: 0.92,
        metalness: 0.035,
        clearcoat: 0.06,
        clearcoatRoughness: 0.72,
        sheen: 0.26,
        sheenRoughness: 0.78,
        transparent: true
      });
      const foilArt = new THREE.MeshPhysicalMaterial({
        color: book.foil,
        map: foilTexture,
        alphaMap: foilTexture,
        bumpMap: foilEmbossTexture,
        bumpScale: 0.016,
        roughness: book.id === "cursor" ? 0.22 : 0.2,
        metalness: book.id === "cursor" ? 0.34 : 0.94,
        clearcoat: 0.18,
        clearcoatRoughness: 0.12,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
      });
      const spineArt = new THREE.MeshPhysicalMaterial({
        map: spineTexture,
        normalMap: clothSurfaceMaps.normal,
        normalScale: new THREE.Vector2(0.3, 0.3),
        roughnessMap: clothSurfaceMaps.roughness,
        bumpMap: clothBumpTexture,
        bumpScale: 0.004,
        roughness: 0.95,
        metalness: 0.025,
        sheen: 0.27,
        sheenRoughness: 0.78,
        transparent: true,
        side: THREE.DoubleSide
      });
      const spineFoilArt = new THREE.MeshPhysicalMaterial({
        color: book.foil,
        map: spineFoilTexture,
        alphaMap: spineFoilTexture,
        bumpMap: spineEmbossTexture,
        bumpScale: 0.017,
        roughness: 0.19,
        metalness: 0.92,
        clearcoat: 0.16,
        clearcoatRoughness: 0.13,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        side: THREE.DoubleSide
      });
      const backArt = new THREE.MeshPhysicalMaterial({
        map: backCoverTexture,
        normalMap: clothSurfaceMaps.normal,
        normalScale: new THREE.Vector2(0.28, 0.28),
        roughnessMap: clothSurfaceMaps.roughness,
        bumpMap: clothBumpTexture,
        bumpScale: 0.0035,
        roughness: 0.96,
        metalness: 0.025,
        sheen: 0.25,
        sheenRoughness: 0.8,
        transparent: true,
        side: THREE.DoubleSide
      });
      const backFoilArt = new THREE.MeshPhysicalMaterial({
        color: book.foil,
        map: backFoilTexture,
        alphaMap: backFoilTexture,
        bumpMap: backEmbossTexture,
        bumpScale: 0.016,
        roughness: 0.21,
        metalness: 0.9,
        clearcoat: 0.14,
        clearcoatRoughness: 0.14,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        side: THREE.DoubleSide
      });
      const endpaperMaterial = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(book.palette.paperPale).lerp(new THREE.Color(0xf2ead8), 0.5),
        map: endpaperTexture,
        bumpMap: paperFaceTexture,
        bumpScale: 0.0018,
        roughness: 0.94,
        metalness: 0,
        sheen: 0.025,
        sheenRoughness: 1,
        side: THREE.DoubleSide,
        transparent: true
      });
      const foreEdgeMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: pageEdgeTextures.fore,
        bumpMap: pageEdgeTextures.fore,
        bumpScale: 0.0022,
        roughness: 0.93,
        metalness: 0,
        sheen: 0.018,
        sheenRoughness: 1,
        side: THREE.DoubleSide,
        transparent: true
      });
      const headTailEdgeMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: pageEdgeTextures.headTail,
        bumpMap: pageEdgeTextures.headTail,
        bumpScale: 0.0015,
        roughness: 0.94,
        metalness: 0,
        sheen: 0.014,
        sheenRoughness: 1,
        side: THREE.DoubleSide,
        transparent: true
      });
      const grooveMaterial = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(book.color).multiplyScalar(0.42),
        roughness: 0.9,
        metalness: 0,
        bumpMap: clothBumpTexture,
        bumpScale: 0.006,
        side: THREE.DoubleSide,
        transparent: true
      });
      const pageMaterial = createFadeMaterial(shared.page);
      const headbandMaterial = createFadeMaterial(shared.headband);
      const interiorPageMaterials = interiorPageTextures.map((texture) => {
        const material = createFadeMaterial(shared.pageSheet);
        material.map = texture;
        material.bumpMap = paperFaceTexture;
        material.bumpScale = 0.0012;
        material.roughness = 0.96;
        material.side = THREE.FrontSide;
        material.needsUpdate = true;
        return material;
      });
      const blankPageMaterial = createFadeMaterial(shared.pageSheet);
      blankPageMaterial.map = paperFaceTexture;
      blankPageMaterial.bumpMap = paperFaceTexture;
      blankPageMaterial.bumpScale = 0.0012;
      blankPageMaterial.roughness = 0.96;
      blankPageMaterial.side = THREE.FrontSide;
      blankPageMaterial.needsUpdate = true;
      const signatureMaterial = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x8d816f).lerp(new THREE.Color(book.palette.paperPale), 0.34),
        roughness: 0.98,
        metalness: 0,
        transparent: true
      });
      const ribbonMaterial = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(book.foil).lerp(new THREE.Color(book.color), 0.28),
        roughness: 0.62,
        metalness: 0.08,
        sheen: 0.36,
        sheenRoughness: 0.68,
        side: THREE.DoubleSide,
        transparent: true
      });

      pageMaterial.map = paperFaceTexture;
      pageMaterial.bumpMap = paperFaceTexture;
      pageMaterial.bumpScale = 0.0014;
      pageMaterial.roughness = 0.95;
      pageMaterial.needsUpdate = true;

      const coverGeometry = new RoundedBoxGeometry(
        width,
        height,
        board,
        2,
        coverRadius
      );
      const pageGeometry = createPageBlockGeometry(
        pageWidth,
        pageHeight,
        pageDepth,
        pageRadius
      );
      const coverSurfaceGeometry = createRoundedPlaneGeometry(
        width - 0.007,
        height - 0.007,
        0.0035
      );
      const endpaperGeometry = createRoundedPlaneGeometry(
        width - 0.045,
        height - 0.045,
        0.003
      );

      root.userData.construction = {
        board,
        coverRadius,
        pageRadius,
        spineRadius,
        spineBoardThickness,
        spineProfile: "flat",
        spineFoilLayered: true,
        backSurfaceLayered: true,
        clothPbrMaps: true,
        foilEmbossed: true,
        interiorPageDesigns: interiorPageTextures.length,
        flexiblePageSegments: FLEXIBLE_PAGE_SEGMENTS,
        clothLikePageDeformation: true,
        turnInStrips: 8,
        ribbonBookmark: true,
        pageSignatures: pageGeometry.userData.pageSignatures,
        gutterCompression: pageGeometry.userData.gutterCompression,
        coverArtInset: 0.007,
        coverOverhangX: (width - pageWidth) * 0.5,
        coverOverhangY: (height - pageHeight) * 0.5
      };

      const pageBlock = createMesh(pageGeometry, pageMaterial, `${book.id}-page-block`);
      pageBlock.position.x = 0.018;
      motion.add(pageBlock);

      const backPivot = new THREE.Group();
      backPivot.name = `${book.id}-back-cover-pivot`;
      backPivot.position.set(-width * 0.5, 0, -depth * 0.5 - board * 0.5);
      const backCover = createMesh(coverGeometry, cloth, `${book.id}-back-cover`);
      backCover.position.x = width * 0.5;
      backPivot.add(backCover);

      const backPlane = createMesh(
        coverSurfaceGeometry,
        backArt,
        `${book.id}-back-cover-art`,
        false,
        false
      );
      backPlane.position.set(width * 0.5, 0, -board * 0.55);
      backPlane.rotation.y = Math.PI;
      backPivot.add(backPlane);

      const backFoilPlane = createMesh(
        coverSurfaceGeometry,
        backFoilArt,
        `${book.id}-back-foil-art`,
        false,
        false
      );
      backFoilPlane.position.set(width * 0.5, 0, -board * 0.605);
      backFoilPlane.rotation.y = Math.PI;
      backPivot.add(backFoilPlane);

      const backEndpaper = createMesh(
        endpaperGeometry,
        endpaperMaterial,
        `${book.id}-back-endpaper`,
        false,
        true
      );
      backEndpaper.position.set(width * 0.5, 0, board * 0.515);
      backPivot.add(backEndpaper);
      addTurnIns(
        backPivot,
        book,
        "back",
        width,
        height,
        board * 0.53,
        cloth
      );

      const backGroove = createMesh(
        shared.plane,
        grooveMaterial,
        `${book.id}-back-hinge-groove`,
        false,
        false
      );
      backGroove.scale.set(0.012, height * 0.94, 1);
      backGroove.position.set(0.038, 0, -board * 0.535);
      backGroove.rotation.y = Math.PI;
      backPivot.add(backGroove);
      motion.add(backPivot);

      const frontPivot = new THREE.Group();
      frontPivot.name = `${book.id}-front-cover-pivot`;
      frontPivot.position.set(-width * 0.5, 0, depth * 0.5 + board * 0.5);
      const frontCover = createMesh(coverGeometry, cloth, `${book.id}-front-cover`);
      frontCover.position.x = width * 0.5;
      frontPivot.add(frontCover);

      const coverPlane = createMesh(
        coverSurfaceGeometry,
        coverArt,
        `${book.id}-cover-art`,
        false,
        false
      );
      coverPlane.position.set(width * 0.5, 0, board * 0.55);
      frontPivot.add(coverPlane);

      const foilPlane = createMesh(
        coverSurfaceGeometry,
        foilArt,
        `${book.id}-foil-art`,
        false,
        false
      );
      foilPlane.position.set(width * 0.5, 0, board * 0.605);
      frontPivot.add(foilPlane);

      const frontEndpaper = createMesh(
        endpaperGeometry,
        endpaperMaterial,
        `${book.id}-front-endpaper`,
        false,
        true
      );
      frontEndpaper.position.set(width * 0.5, 0, -board * 0.515);
      frontEndpaper.rotation.y = Math.PI;
      frontPivot.add(frontEndpaper);
      addTurnIns(
        frontPivot,
        book,
        "front",
        width,
        height,
        -board * 0.53,
        cloth
      );

      const frontGroove = createMesh(
        shared.plane,
        grooveMaterial,
        `${book.id}-front-hinge-groove`,
        false,
        false
      );
      frontGroove.scale.set(0.012, height * 0.94, 1);
      frontGroove.position.set(0.038, 0, board * 0.655);
      frontPivot.add(frontGroove);
      motion.add(frontPivot);

      const pagePivots = [];
      const pageSurfaces = [];
      for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
        const leafOrder = 5 - pageIndex;
        const frontPageMaterial = leafOrder < 4
          ? interiorPageMaterials[leafOrder * 2]
          : blankPageMaterial;
        const backPageMaterial = leafOrder < 4
          ? interiorPageMaterials[leafOrder * 2 + 1]
          : blankPageMaterial;
        const pagePivot = new THREE.Group();
        pagePivot.name = `${book.id}-page-${pageIndex}`;
        pagePivot.position.set(
          -width * 0.5 + spineWidth * 0.65,
          0,
          pageDepth * 0.5 + 0.0015 + pageIndex * 0.0015
        );
        pagePivot.userData.restZ = pagePivot.position.z;
        pagePivot.userData.turnedZ = depth * 0.5 + board + 0.004 + leafOrder * 0.0015;
        const frontPageGeometry = new THREE.PlaneGeometry(
          1,
          1,
          FLEXIBLE_PAGE_SEGMENTS,
          FLEXIBLE_PAGE_VERTICAL_SEGMENTS
        );
        const backPageGeometry = new THREE.PlaneGeometry(
          1,
          1,
          FLEXIBLE_PAGE_SEGMENTS,
          FLEXIBLE_PAGE_VERTICAL_SEGMENTS
        );
        const visiblePageWidth = pageWidth - spineWidth * 0.42;
        const frontPage = createMesh(
          frontPageGeometry,
          frontPageMaterial,
          `${book.id}-page-sheet-${pageIndex}-front`,
          false,
          true
        );
        frontPage.scale.set(visiblePageWidth, pageHeight - 0.014, 1);
        frontPage.position.set(visiblePageWidth * 0.5, 0, 0.00022);
        pagePivot.add(frontPage);
        pageSurfaces.push(frontPage);

        const backPage = createMesh(
          backPageGeometry,
          backPageMaterial,
          `${book.id}-page-sheet-${pageIndex}-back`,
          false,
          true
        );
        backPage.scale.set(visiblePageWidth, pageHeight - 0.014, 1);
        backPage.position.set(visiblePageWidth * 0.5, 0, -0.00022);
        backPage.rotation.y = Math.PI;
        pagePivot.add(backPage);
        pageSurfaces.push(backPage);
        pagePivot.userData.flex = {
          curve: 0,
          curveVelocity: 0,
          twist: 0,
          twistVelocity: 0,
          surfaces: [
            {
              geometry: frontPageGeometry,
              position: frontPageGeometry.attributes.position,
              base: Float32Array.from(frontPageGeometry.attributes.position.array),
              direction: 1
            },
            {
              geometry: backPageGeometry,
              position: backPageGeometry.attributes.position,
              base: Float32Array.from(backPageGeometry.attributes.position.array),
              direction: -1
            }
          ]
        };
        motion.add(pagePivot);
        pagePivots.push(pagePivot);
      }

      const spineGeometry = new RoundedBoxGeometry(
        spineBoardThickness,
        height - 0.012,
        depth + board * 1.88,
        1,
        spineRadius
      );
      const spine = createMesh(spineGeometry, spineArt, `${book.id}-flat-spine`);
      spine.position.x = -width * 0.5 - spineBoardThickness * 0.35;
      spine.userData.profile = "flat";
      motion.add(spine);

      const spineFoil = createMesh(
        shared.plane,
        spineFoilArt,
        `${book.id}-spine-foil`,
        false,
        false
      );
      spineFoil.scale.set(depth + board * 1.82, height - 0.018, 1);
      spineFoil.rotation.y = -Math.PI * 0.5;
      spineFoil.position.set(
        spine.position.x - spineBoardThickness * 0.505,
        0,
        0
      );
      motion.add(spineFoil);

      const spineLining = createMesh(
        new RoundedBoxGeometry(
          spineWidth * 0.68,
          height - 0.056,
          Math.max(0.045, pageDepth - 0.008),
          1,
          0.0015
        ),
        endpaperMaterial,
        `${book.id}-spine-lining`
      );
      spineLining.position.set(-width * 0.5 + spineWidth * 0.38, 0, 0);
      motion.add(spineLining);

      [-1, 1].forEach((direction) => {
        const headbandGeometry = new THREE.CylinderGeometry(
          0.012,
          0.012,
          pageDepth * 0.88,
          12,
          1,
          false
        );
        const headband = createMesh(
          headbandGeometry,
          headbandMaterial,
          `${book.id}-headband-${direction}`
        );
        headband.rotation.x = Math.PI * 0.5;
        headband.position.set(
          -pageWidth * 0.5 + 0.046,
          direction * (pageHeight * 0.5 - 0.004),
          0
        );
        motion.add(headband);
      });

      const ribbonGeometry = createRoundedPlaneGeometry(
        0.034,
        pageHeight * 0.76,
        0.002
      );
      const ribbon = createMesh(
        ribbonGeometry,
        ribbonMaterial,
        `${book.id}-ribbon-bookmark`,
        false,
        true
      );
      ribbon.position.set(
        -pageWidth * 0.5 + 0.09 + (book.seed % 3) * 0.018,
        -pageHeight * 0.17,
        pageDepth * 0.5 + 0.003
      );
      ribbon.rotation.z = (book.seed % 2 ? -1 : 1) * 0.014;
      motion.add(ribbon);

      for (let signatureIndex = 0; signatureIndex < 6; signatureIndex += 1) {
        const signature = createMesh(
          shared.box,
          signatureMaterial,
          `${book.id}-page-signature-${signatureIndex + 1}`,
          false,
          true
        );
        signature.scale.set(0.0035, 0.00135, pageDepth * 0.91);
        signature.position.set(
          0.018 + pageWidth * 0.5 + 0.001,
          -pageHeight * 0.5 + ((signatureIndex + 1) / 7) * pageHeight,
          0
        );
        motion.add(signature);
      }

      const foreEdge = createMesh(
        shared.plane,
        foreEdgeMaterial,
        `${book.id}-fore-edge`,
        false,
        true
      );
      foreEdge.scale.set(pageDepth * 0.94, pageHeight - 0.028, 1);
      foreEdge.rotation.y = Math.PI * 0.5;
      foreEdge.position.set(0.018 + pageWidth * 0.5 + 0.002, 0, 0);
      motion.add(foreEdge);

      [-1, 1].forEach((direction) => {
        const edge = createMesh(
          shared.plane,
          headTailEdgeMaterial,
          `${book.id}-${direction > 0 ? "head" : "tail"}-edge`,
          false,
          true
        );
        edge.scale.set(pageWidth - 0.035, pageDepth * 0.94, 1);
        edge.rotation.x = direction > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
        edge.position.set(
          0.018,
          direction * (pageHeight * 0.5 + 0.002),
          0
        );
        motion.add(edge);
      });

      const hitMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const hit = createMesh(shared.box, hitMaterial, `${book.id}-hit-target`, false, false);
      hit.scale.set(width * 1.34, height * 1.2, Math.max(depth * 4, 1));
      hit.position.set(-spineWidth * 0.18, 0, 0.12);
      hit.userData.index = index;
      motion.add(hit);
      hitTargets.push(hit);

      const contactShadowMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(book.palette.shelfDark),
        alphaMap: makeContactShadowTexture(),
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const contactShadow = createMesh(
        shared.plane,
        contactShadowMaterial,
        `${book.id}-contact-shadow`,
        false,
        false
      );
      contactShadow.scale.set(width * 1.22, depth * 2.05, 1);
      contactShadow.rotation.x = -Math.PI * 0.5;
      contactShadow.position.set(0, -height * 0.5 - 0.022, 0.025);
      root.add(contactShadow);

      return {
        data: book,
        root,
        motion,
        frontPivot,
        frontCover,
        pageBlock,
        pagePivots,
        pageSurfaces,
        pageGestureSurfaces: [...pageSurfaces, pageBlock],
        hit,
        coverTexture,
        foilTexture,
        clothBumpTexture,
        clothSurfaceMaps,
        paperFaceTexture,
        interiorPageTextures,
        endpaperTexture,
        pageEdgeTextures,
        spineTexture,
        spineFoilTexture,
        backCoverTexture,
        backFoilTexture,
        foilEmbossTexture,
        spineEmbossTexture,
        backEmbossTexture,
        contactShadow,
        opacity: 1,
        lastOffset: null,
        fadeMaterials: [
          cloth,
          coverArt,
          foilArt,
          spineArt,
          spineFoilArt,
          backArt,
          backFoilArt,
          endpaperMaterial,
          foreEdgeMaterial,
          headTailEdgeMaterial,
          grooveMaterial,
          pageMaterial,
          ...interiorPageMaterials,
          blankPageMaterial,
          headbandMaterial,
          signatureMaterial,
          ribbonMaterial
        ],
        materials: [
          cloth,
          coverArt,
          foilArt,
          spineArt,
          spineFoilArt,
          backArt,
          backFoilArt,
          endpaperMaterial,
          foreEdgeMaterial,
          headTailEdgeMaterial,
          grooveMaterial,
          pageMaterial,
          ...interiorPageMaterials,
          blankPageMaterial,
          headbandMaterial,
          signatureMaterial,
          ribbonMaterial,
          contactShadowMaterial,
          hitMaterial
        ],
        base: {
          width,
          height,
          depth
        }
      };
    }

    function configureResponsiveTargets() {
      const narrow = viewWidth < 820;
      shelfCameraPosition.set(0, narrow ? 2.02 : 1.92, narrow ? 8.7 : 8.1);
      shelfCameraTarget.set(0, narrow ? 1.57 : 1.55, 0);
      inspectPosition.set(narrow ? 0 : -2.25, narrow ? 2.3 : 1.56, narrow ? 0.15 : 0);
      inspectCameraPosition.set(narrow ? 0 : -0.52, narrow ? 2.46 : 1.78, narrow ? 5.7 : 5.25);
      inspectCameraTarget.copy(inspectPosition);

      if (narrow) {
        detailViewOffsetX = 0;
        detailSafeWidth = viewWidth;
        return;
      }

      const panelBounds = detailPanel.getBoundingClientRect();
      const panelLeft = panelBounds.left > 0 ? panelBounds.left : viewWidth * 0.64;
      const gutter = clamp(viewWidth * 0.035, 32, 56);
      detailSafeWidth = Math.max(viewWidth * 0.42, panelLeft - gutter);
      const wideLayoutProgress = clamp((viewWidth - 820) / 620, 0, 1);
      const bookCenterRatio = THREE.MathUtils.lerp(0.55, 0.615, wideLayoutProgress);
      const desiredBookCenter = detailSafeWidth * bookCenterRatio;
      detailViewOffsetX = Math.max(0, viewWidth * 0.5 - desiredBookCenter);
    }

    function getInspectScale() {
      if (!activeBook || viewWidth < 820) return 0.82;
      const distance = Math.abs(inspectCameraPosition.z - inspectPosition.z);
      const worldHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
      const pixelsPerWorld = viewHeight / Math.max(worldHeight, 0.001);
      const estimatedBookWidth = activeBook.base.width * pixelsPerWorld * 1.16;
      const scaleForSafeWidth = (detailSafeWidth * 0.72) / Math.max(estimatedBookWidth, 1);
      return clamp(scaleForSafeWidth, 0.9, 1.32);
    }

    function applyDetailViewOffset() {
      if (Math.abs(currentViewOffsetX) < 0.5) {
        camera.clearViewOffset();
        return;
      }
      camera.setViewOffset(
        viewWidth,
        viewHeight,
        currentViewOffsetX,
        0,
        viewWidth,
        viewHeight
      );
    }

    function createWoodTexture(repeatX, repeatY, rotation = 0) {
      if (!woodTextureReady) return null;
      const texture = new THREE.Texture(woodTextureImage);
      texture.name = "editorial-walnut";
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.center.set(0.5, 0.5);
      texture.rotation = rotation;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
      return texture;
    }

    function applyWoodTexture() {
      if (!woodTextureReady || !renderer) return;

      const woodMap = createWoodTexture(7, 1.65, Math.PI * 0.5);
      const darkWoodMap = woodMap?.clone() || null;

      if (darkWoodMap) {
        darkWoodMap.name = "editorial-walnut-dark";
        darkWoodMap.needsUpdate = true;
      }

      shared.walnut.map = woodMap;
      shared.walnut.needsUpdate = true;
      shared.walnutDark.map = darkWoodMap;
      shared.walnutDark.needsUpdate = true;
      requestFrame();
    }

    function addRoom() {
      const floor = createMesh(shared.plane, new THREE.MeshStandardMaterial({
        color: 0xd8c8aa,
        roughness: 0.92,
        metalness: 0
      }), "paper-floor", false, true);
      floor.scale.set(30, 20, 1);
      floor.rotation.x = -Math.PI * 0.5;
      floor.position.y = -0.02;
      scene.add(floor);

      const back = createMesh(shared.plane, new THREE.MeshStandardMaterial({
        color: 0xe9dfcb,
        roughness: 1,
        metalness: 0
      }), "paper-backdrop", false, true);
      back.scale.set(28, 14, 1);
      back.position.set(0, 5.5, -3.3);
      scene.add(back);

      const shelf = createMesh(shared.box, shared.walnut, "walnut-shelf");
      shelf.scale.set(17, 0.28, 1.08);
      shelf.position.set(0, 0.33, -0.03);
      shelfStage.add(shelf);

      const shelfLip = createMesh(shared.box, shared.walnutDark, "walnut-shelf-lip");
      shelfLip.scale.set(17.05, 0.075, 1.14);
      shelfLip.position.set(0, 0.205, 0.02);
      shelfStage.add(shelfLip);

      const backRail = createMesh(shared.box, shared.walnut, "walnut-back-rail");
      backRail.scale.set(17, 0.17, 0.2);
      backRail.position.set(0, 0.68, -0.52);
      shelfStage.add(backRail);

      [-7.65, 7.65].forEach((x, index) => {
        const upright = createMesh(shared.box, shared.walnutDark, `shelf-upright-${index}`);
        upright.scale.set(0.2, 3.8, 0.72);
        upright.position.set(x, 2.05, -0.28);
        shelfStage.add(upright);
      });

      const shadowStrip = createMesh(shared.plane, new THREE.MeshBasicMaterial({
        color: 0x2f1d13,
        alphaMap: makeContactShadowTexture(),
        transparent: true,
        opacity: 0.22,
        depthWrite: false
      }), "shelf-contact-shadow", false, false);
      shadowStrip.scale.set(16, 0.85, 1);
      shadowStrip.rotation.x = -Math.PI * 0.5;
      shadowStrip.position.set(0, 0.49, 0.06);
      shelfStage.add(shadowStrip);

      roomMaterials.floor = floor.material;
      roomMaterials.wall = back.material;
      roomMaterials.shelf = shared.walnut;
      roomMaterials.shelfDark = shared.walnutDark;
      roomMaterials.shadow = shadowStrip.material;
    }

    function addLights() {
      roomLights.hemisphere = new THREE.HemisphereLight(0xfff8e8, 0x5b4030, 0.56);
      scene.add(roomLights.hemisphere);

      const key = new THREE.DirectionalLight(0xffe8c2, 1.42);
      key.name = "shadow-key";
      key.position.set(-4.6, 7.4, 5.8);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = -6;
      key.shadow.camera.right = 6;
      key.shadow.camera.top = 6;
      key.shadow.camera.bottom = -1.5;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 18;
      key.shadow.bias = -0.00018;
      key.shadow.normalBias = 0.018;
      key.shadow.radius = 3.5;
      scene.add(key);
      roomLights.key = key;

      const softKey = new THREE.RectAreaLight(0xffe8c2, 5.4, 4.8, 5.6);
      softKey.name = "cloth-softbox";
      softKey.position.set(-3.2, 5.5, 4.6);
      softKey.lookAt(0, 1.45, 0);
      scene.add(softKey);
      roomLights.softKey = softKey;

      const fill = new THREE.DirectionalLight(0xd8e3e7, 0.3);
      fill.name = "cool-fill";
      fill.position.set(5.5, 3.6, 4.2);
      scene.add(fill);
      roomLights.fill = fill;

      const rim = new THREE.RectAreaLight(0xd5a45e, 3.45, 1.6, 4.8);
      rim.name = "foil-rake";
      rim.position.set(3.8, 3.6, -2.1);
      rim.lookAt(-0.2, 1.5, 0);
      scene.add(rim);
      roomLights.rim = rim;

      const backFill = new THREE.RectAreaLight(0xd8e3e7, 2.7, 3.8, 4.8);
      backFill.name = "back-cover-softbox";
      backFill.position.set(-1.8, 2.9, -4.5);
      backFill.lookAt(-0.1, 1.45, 0);
      scene.add(backFill);
      roomLights.backFill = backFill;

      const spineRake = new THREE.RectAreaLight(0xffe8c2, 1.9, 0.9, 4.6);
      spineRake.name = "spine-rake";
      spineRake.position.set(-4.6, 3.2, 1.1);
      spineRake.lookAt(-0.55, 1.5, 0);
      scene.add(spineRake);
      roomLights.spineRake = spineRake;

      const pageRake = new THREE.RectAreaLight(0xfff7e7, 2.15, 1.15, 3.8);
      pageRake.name = "page-edge-rake";
      pageRake.position.set(4.2, 4.8, 3.1);
      pageRake.lookAt(0.65, 1.55, 0);
      scene.add(pageRake);
      roomLights.pageRake = pageRake;
    }

    function addDust() {
      const dustCount = 110;
      const positions = new Float32Array(dustCount * 3);
      const random = seededRandom(20260728);
      for (let index = 0; index < dustCount; index += 1) {
        positions[index * 3] = (random() - 0.5) * 14;
        positions[index * 3 + 1] = 0.7 + random() * 4.7;
        positions[index * 3 + 2] = -1.7 + random() * 4;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: 0xc3a97b,
        size: 0.014,
        transparent: true,
        opacity: 0.3,
        depthWrite: false
      });
      const dust = new THREE.Points(geometry, material);
      dust.name = "paper-dust";
      dust.userData.isDust = true;
      scene.add(dust);
    }

    function buildMarkers() {
      BOOKS.forEach((book, index) => {
        const button = document.createElement("button");
        button.className = "marker";
        button.type = "button";
        button.role = "tab";
        button.setAttribute("aria-label", `Select volume ${index + 1}: ${book.title}`);
        button.setAttribute("aria-current", index === 0 ? "true" : "false");
        button.setAttribute("aria-selected", index === 0 ? "true" : "false");
        button.addEventListener("click", () => selectMarker(index, button));
        markers.append(button);
      });
    }

    function setThemeColorsImmediately() {
      roomMaterials.floor?.color.copy(themeTargets.floor);
      roomMaterials.wall?.color.copy(themeTargets.wall);
      roomMaterials.shelf?.color.copy(themeTargets.shelf);
      roomMaterials.shelfDark?.color.copy(themeTargets.shelfDark);
      roomMaterials.shadow?.color.copy(themeTargets.shadow);
      scene?.fog?.color.copy(themeTargets.fog);
      roomLights.hemisphere?.color.copy(themeTargets.hemisphere);
      roomLights.hemisphere?.groundColor.copy(themeTargets.hemisphereGround);
      roomLights.key?.color.copy(themeTargets.key);
      roomLights.softKey?.color.copy(themeTargets.key);
      roomLights.fill?.color.copy(themeTargets.fill);
      roomLights.rim?.color.copy(themeTargets.rim);
      roomLights.backFill?.color.copy(themeTargets.fill);
      roomLights.spineRake?.color.copy(themeTargets.key);
      roomLights.pageRake?.color.copy(themeTargets.hemisphere);
      themeMoving = false;
    }

    function applyBookTheme(book) {
      const palette = book.palette;
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty("--paper", palette.paper);
      rootStyle.setProperty("--paper-deep", palette.paperDeep);
      rootStyle.setProperty("--paper-pale", palette.paperPale);
      rootStyle.setProperty("--ink", palette.ink);
      rootStyle.setProperty("--ink-soft", palette.inkSoft);
      rootStyle.setProperty("--walnut", palette.shelf);
      rootStyle.setProperty("--walnut-deep", palette.shelfDark);
      rootStyle.setProperty("--rule", `color-mix(in srgb, ${palette.ink} 24%, transparent)`);
      rootStyle.setProperty("--accent", book.foil);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.paper);

      themeTargets.floor.set(palette.paperDeep);
      themeTargets.wall.set(palette.wall);
      themeTargets.shelf.set(palette.shelf);
      themeTargets.shelfDark.set(palette.shelfDark);
      themeTargets.shadow.set(palette.shelfDark);
      themeTargets.fog.set(palette.wall);
      themeTargets.hemisphere.set(palette.paperPale);
      themeTargets.hemisphereGround.set(palette.shelf);
      themeTargets.key.set(palette.light);
      themeTargets.fill.set(palette.fill);
      themeTargets.rim.set(book.foil);

      if (!themeInitialized || reducedMotion) {
        themeInitialized = true;
        setThemeColorsImmediately();
      } else {
        themeMoving = true;
        requestFrame();
      }
    }

    function updateTheme(delta) {
      if (!themeMoving) return false;
      const amount = 1 - Math.exp(-delta * 5.5);
      let largestGap = 0;
      const easeColor = (current, target) => {
        if (!current) return;
        const redGap = current.r - target.r;
        const greenGap = current.g - target.g;
        const blueGap = current.b - target.b;
        largestGap = Math.max(
          largestGap,
          redGap * redGap + greenGap * greenGap + blueGap * blueGap
        );
        current.lerp(target, amount);
      };

      easeColor(roomMaterials.floor?.color, themeTargets.floor);
      easeColor(roomMaterials.wall?.color, themeTargets.wall);
      easeColor(roomMaterials.shelf?.color, themeTargets.shelf);
      easeColor(roomMaterials.shelfDark?.color, themeTargets.shelfDark);
      easeColor(roomMaterials.shadow?.color, themeTargets.shadow);
      easeColor(scene?.fog?.color, themeTargets.fog);
      easeColor(roomLights.hemisphere?.color, themeTargets.hemisphere);
      easeColor(roomLights.hemisphere?.groundColor, themeTargets.hemisphereGround);
      easeColor(roomLights.key?.color, themeTargets.key);
      easeColor(roomLights.softKey?.color, themeTargets.key);
      easeColor(roomLights.fill?.color, themeTargets.fill);
      easeColor(roomLights.rim?.color, themeTargets.rim);
      easeColor(roomLights.backFill?.color, themeTargets.fill);
      easeColor(roomLights.spineRake?.color, themeTargets.key);
      easeColor(roomLights.pageRake?.color, themeTargets.hemisphere);

      if (largestGap < 0.0000025) {
        setThemeColorsImmediately();
      }
      return themeMoving;
    }

    function updateSelection(index, announce = false) {
      const nextIndex = mod(index, BOOKS.length);
      if (nextIndex === selectedIndex && !announce) return;
      selectedIndex = nextIndex;
      const book = BOOKS[selectedIndex];
      selectionTitle.textContent = book.title;
      selectionNote.textContent = book.note;
      counter.textContent = `${pad(selectedIndex + 1)} / ${pad(BOOKS.length)}`;
      paletteLabel.textContent = book.paletteLabel;
      inspectButton.setAttribute("aria-label", `Open ${book.title}`);
      applyBookTheme(book);

      [...markers.children].forEach((marker, markerIndex) => {
        const current = markerIndex === selectedIndex;
        marker.setAttribute("aria-current", current ? "true" : "false");
        marker.setAttribute("aria-selected", current ? "true" : "false");
        marker.tabIndex = current ? 0 : -1;
      });

      if (announce) {
        liveRegion.textContent = `Selected volume ${selectedIndex + 1} of ${BOOKS.length}: ${book.title}. ${book.note}`;
      }
    }

    function populateDetail(book) {
      detailEyebrow.textContent = `Volume ${book.roman} · ${book.discipline}`;
      detailTitle.textContent = book.title;
      detailDeck.textContent = book.deck;
      detailBinding.textContent = book.binding;
      detailFormat.textContent = book.format;
      detailTheme.textContent = book.theme;
      detailMotif.textContent = book.motif;

      // Cuốn nào có practiceUrl (hiện chỉ Volume II — Word) thì hiện nút
      // CTA "Luyện tập" mở simulator tương ứng ở tab mới; cuốn khác vẫn
      // thuần trưng bày như trước (không có nút).
      if (practiceButton) {
        if (book.practiceUrl) {
          practiceButton.hidden = false;
          practiceButton.textContent = book.practiceLabel || "Luyện tập";
          practiceButton.setAttribute("aria-label", `${book.practiceLabel || "Luyện tập"} — ${book.title}`);
        } else {
          practiceButton.hidden = true;
        }
      }
    }

    function getSpreadLabels(book) {
      return [
        "Title page",
        `${book.chapters[0]} · Plate`,
        `${book.chapters[1]} · Notes`,
        `${book.chapters[2]} · System`,
        "Colophon"
      ];
    }

    function updatePageControls(announce = false) {
      const book = activeBook?.data || BOOKS[selectedIndex];
      const labels = getSpreadLabels(book);
      const interactionLocked = mode !== "detail" || !readingOpen;
      const previousDisabled = interactionLocked || currentSpread === 0;
      const nextDisabled = interactionLocked || currentSpread === SPREAD_COUNT - 1;

      previousPageButton.disabled = previousDisabled;
      nextPageButton.disabled = nextDisabled;
      pageLabel.textContent = readingOpen ? labels[currentSpread] : "Closed";
      pageCounter.textContent = readingOpen
        ? `${pad(currentSpread + 1)} / ${pad(SPREAD_COUNT)}`
        : "Click book to open";
      toggleBookButton.textContent = readingOpen ? "Close book" : "Open book";
      toggleBookButton.setAttribute("aria-pressed", String(readingOpen));
      detailMicrocopy.textContent = readingOpen
        ? "Drag pages · Drag cover to close · Background to orbit"
        : "Drag cover or click once to open · Background to orbit";
      previousPageButton.setAttribute(
        "aria-label",
        previousDisabled
          ? "Previous sample page"
          : `Previous sample page: ${labels[currentSpread - 1]}`
      );
      nextPageButton.setAttribute(
        "aria-label",
        nextDisabled
          ? "Next sample page"
          : `Next sample page: ${labels[currentSpread + 1]}`
      );

      if (announce && activeBook && readingOpen) {
        liveRegion.textContent = `Page ${currentSpread + 1} of ${SPREAD_COUNT}: ${labels[currentSpread]}.`;
      }
    }

    function setReadingOpen(open, announce = true) {
      if (mode !== "detail" || readingOpen === open) return;
      cancelPageDrag();
      readingOpen = open;
      if (!readingOpen) currentSpread = 0;
      canvas.classList.remove("has-page-hover", "has-closed-book-hover");
      updatePageControls(false);
      pointerDirty = true;

      if (announce && activeBook) {
        liveRegion.textContent = readingOpen
          ? `${activeBook.data.title} opened to its title page. Drag a page horizontally or use the arrow controls to read.`
          : `${activeBook.data.title} closed. Drag the cover, click the book, or use Open book to begin reading.`;
      }
      requestFrame();
    }

    function turnPage(direction) {
      if (mode !== "detail" || !readingOpen) return;
      const nextSpread = clamp(
        currentSpread + direction,
        0,
        SPREAD_COUNT - 1
      );
      if (nextSpread === currentSpread) return;
      currentSpread = nextSpread;
      updatePageControls(true);
      requestFrame();
    }

    function updateFlexiblePage(
      pagePivot,
      targetCurve,
      delta,
      immediate = false,
      targetTwist = 0
    ) {
      const flex = pagePivot.userData.flex;
      if (!flex) return;
      const settleImmediately = immediate || reducedMotion;
      const step = Math.min(delta, 0.033);
      let nextCurve = targetCurve;
      let nextTwist = targetTwist;

      if (settleImmediately) {
        flex.curveVelocity = 0;
        flex.twistVelocity = 0;
      } else {
        const curveAcceleration = (
          (targetCurve - flex.curve) * 178
          - flex.curveVelocity * 19
        );
        const twistAcceleration = (
          (targetTwist - flex.twist) * 210
          - flex.twistVelocity * 21
        );
        flex.curveVelocity = clamp(
          flex.curveVelocity + curveAcceleration * step,
          -1.8,
          1.8
        );
        flex.twistVelocity = clamp(
          flex.twistVelocity + twistAcceleration * step,
          -1.6,
          1.6
        );
        nextCurve = clamp(
          flex.curve + flex.curveVelocity * step,
          -0.025,
          0.19
        );
        nextTwist = clamp(
          flex.twist + flex.twistVelocity * step,
          -0.12,
          0.12
        );

        if (
          Math.abs(targetCurve - nextCurve) < 0.00002
          && Math.abs(flex.curveVelocity) < 0.0008
        ) {
          nextCurve = targetCurve;
          flex.curveVelocity = 0;
        }
        if (
          Math.abs(targetTwist - nextTwist) < 0.00002
          && Math.abs(flex.twistVelocity) < 0.0008
        ) {
          nextTwist = targetTwist;
          flex.twistVelocity = 0;
        }
      }

      if (
        !settleImmediately
        && Math.abs(nextCurve - flex.curve) < 0.00001
        && Math.abs(targetCurve - nextCurve) < 0.00001
        && Math.abs(nextTwist - flex.twist) < 0.00001
        && Math.abs(targetTwist - nextTwist) < 0.00001
      ) return;

      flex.curve = nextCurve;
      flex.twist = nextTwist;
      flex.surfaces.forEach((surface) => {
        const { position, base, direction, geometry } = surface;
        for (let vertex = 0; vertex < position.count; vertex += 1) {
          const offset = vertex * 3;
          const x = base[offset];
          const y = base[offset + 1];
          const u = x + 0.5;
          const mappedU = direction > 0 ? u : 1 - u;
          const arch = Math.sin(Math.PI * mappedU);
          const freeEdgeLift = mappedU * mappedU * 0.16;
          const shape = arch * 0.84 + freeEdgeLift;
          const diagonalTwist = (
            nextTwist
            * y
            * Math.pow(mappedU, 1.35)
          );
          const softRipple = (
            nextTwist
            * Math.sin(mappedU * Math.PI * 2)
            * (1 - Math.min(1, Math.abs(y) * 1.65))
            * 0.09
          );
          const z = (
            nextCurve * shape * (1 + y * 0.14)
            + diagonalTwist
            + softRipple
          ) * direction;
          position.setXYZ(vertex, x, y, z);
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
      });
    }

    function updatePaginatedBook(rig, delta, openAmount = 1) {
      const amount = clamp(openAmount, 0, 1);
      const speed = reducedMotion ? 1000 : 10.5;
      const hoverCrack = (
        mode === "detail"
        && !readingOpen
        && detailBookHovered
        && !reducedMotion
      ) ? -0.16 : 0;
      const coverTarget = amount > 0
        ? (-Math.PI + 0.055) * amount
        : hoverCrack;

      rig.frontPivot.rotation.y = damp(
        rig.frontPivot.rotation.y,
        coverTarget,
        speed,
        delta
      );

      rig.pagePivots.forEach((pagePivot, pageIndex) => {
        const leafOrder = rig.pagePivots.length - 1 - pageIndex;
        let pageTarget = 0;
        let positionTarget = pagePivot.userData.restZ;
        let pageTwistTarget = 0;
        let dragCurveBoost = 0;
        let flexTwistTarget = 0;

        if (leafOrder < PAGINATED_LEAF_COUNT) {
          const isTurned = leafOrder < currentSpread;
          const unturnedTarget = -0.038 + leafOrder * 0.008;
          const turnedTarget = -Math.PI + 0.085 + leafOrder * 0.014;
          pageTarget = isTurned ? turnedTarget : unturnedTarget;
          positionTarget = isTurned
            ? pagePivot.userData.turnedZ
            : pagePivot.userData.restZ;

          if (pageDrag.active && pageDrag.direction !== 0) {
            const dragLeafOrder = pageDrag.direction > 0
              ? currentSpread
              : currentSpread - 1;
            if (leafOrder === dragLeafOrder) {
              const dragProgress = smoothstep(pageDrag.progress);
              const dragEnvelope = Math.sin(Math.PI * dragProgress);
              const speedResponse = clamp(
                Math.abs(pageDrag.progressVelocity) / 5.5,
                0,
                1
              );
              const signedSpeed = clamp(
                pageDrag.progressVelocity / 5.5,
                -1,
                1
              );
              pageTarget = pageDrag.direction > 0
                ? lerp(unturnedTarget, turnedTarget, dragProgress)
                : lerp(turnedTarget, unturnedTarget, dragProgress);
              positionTarget = pageDrag.direction > 0
                ? lerp(pagePivot.userData.restZ, pagePivot.userData.turnedZ, dragProgress)
                : lerp(pagePivot.userData.turnedZ, pagePivot.userData.restZ, dragProgress);
              pageTwistTarget = pageDrag.direction
                * dragEnvelope
                * (0.014 + pageDrag.verticalBias * 0.026);
              dragCurveBoost = dragEnvelope * (
                0.032
                + speedResponse * 0.064
              );
              flexTwistTarget = dragEnvelope * (
                pageDrag.verticalBias * 0.08
                + signedSpeed * pageDrag.direction * 0.03
              );
            }
          }

          pagePivot.position.z = damp(
            pagePivot.position.z,
            pagePivot.userData.restZ
              + (positionTarget - pagePivot.userData.restZ) * amount,
            speed,
            delta
          );
        } else {
          pageTarget = -0.006 + (leafOrder - PAGINATED_LEAF_COUNT) * 0.003;
          pagePivot.position.z = damp(
            pagePivot.position.z,
            pagePivot.userData.restZ,
            speed,
            delta
          );
        }

        pagePivot.rotation.y = damp(
          pagePivot.rotation.y,
          pageTarget * amount,
          speed,
          delta
        );
        pagePivot.rotation.z = damp(
          pagePivot.rotation.z,
          pageTwistTarget * amount,
          speed,
          delta
        );
        const turnProgress = clamp(
          Math.abs(pagePivot.rotation.y) / Math.PI,
          0,
          1
        );
        const curveTarget = amount > 0
          ? amount * (
              0.004
              + Math.sin(Math.PI * turnProgress) * 0.082
              + dragCurveBoost
            )
          : 0;
        updateFlexiblePage(
          pagePivot,
          curveTarget,
          delta,
          false,
          flexTwistTarget * amount
        );
      });
    }

    function selectMarker(index, origin) {
      if (mode !== "hero") return;
      const rounded = Math.round(targetPosition);
      const current = mod(rounded, BOOKS.length);
      let delta = index - current;
      if (delta > BOOKS.length / 2) delta -= BOOKS.length;
      if (delta < -BOOKS.length / 2) delta += BOOKS.length;
      targetPosition = rounded + delta;
      focusReturnTarget = origin;
      updateSelection(index, true);
      requestFrame();
    }

    function navigate(direction, origin) {
      if (mode !== "hero") return;
      targetPosition = Math.round(targetPosition) + direction;
      focusReturnTarget = origin;
      updateSelection(mod(Math.round(targetPosition), BOOKS.length), true);
      requestFrame();
    }

    function alignShelfToSelection() {
      const rounded = Math.round(targetPosition);
      const current = mod(rounded, BOOKS.length);
      let delta = selectedIndex - current;
      if (delta > BOOKS.length / 2) delta -= BOOKS.length;
      if (delta < -BOOKS.length / 2) delta += BOOKS.length;
      targetPosition = rounded + delta;
      position = targetPosition;
    }

    function snapRigToShelfSlot(rig, index) {
      let offset = index - position;
      offset -= Math.round(offset / BOOKS.length) * BOOKS.length;
      const distance = Math.abs(offset);
      const focus = 1 - clamp(distance, 0, 1);
      const fadeProgress = clamp((distance - 2.55) / 0.7, 0, 1);
      const opacity = 1 - smoothstep(fadeProgress);

      rig.root.position.set(
        offset * spacing,
        shelfBoardTop + rig.base.height * 0.5 + focus * 0.15,
        0.13 + focus * 0.24 - Math.min(distance, 2.8) * 0.07
      );
      rig.root.rotation.set(0, -offset * 0.105, -offset * 0.018);
      rig.root.scale.setScalar(1 + focus * 0.09);
      rig.motion.position.y = 0;
      rig.motion.rotation.set(0, 0, 0);
      rig.frontPivot.rotation.y = 0;
      rig.pagePivots.forEach((pagePivot) => {
        pagePivot.rotation.y = 0;
        pagePivot.rotation.z = 0;
        pagePivot.position.z = pagePivot.userData.restZ;
        updateFlexiblePage(pagePivot, 0, 0, true);
      });
      rig.opacity = opacity;
      rig.fadeMaterials.forEach((material) => {
        material.opacity = opacity;
      });
      rig.contactShadow.visible = true;
      rig.contactShadow.material.opacity = opacity * 0.24;
      rig.hit.visible = opacity > 0.12;
      rig.lastOffset = offset;
    }

    function setPointerFromEvent(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.clientX = event.clientX;
      pointer.clientY = event.clientY;
      pointer.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointerDirty = true;
    }

    function updateHover() {
      pointerDirty = false;
      if (mode === "detail" && activeBook) {
        setHovered(-1);
        if (readingOpen) {
          detailBookHovered = false;
          canvas.classList.remove("has-closed-book-hover");
          canvas.classList.toggle(
            "has-page-hover",
            pageDrag.active
              || Boolean(pageSurfaceAtPointer())
              || Boolean(coverSurfaceAtPointer())
          );
        } else {
          detailBookHovered = Boolean(coverSurfaceAtPointer());
          canvas.classList.remove("has-page-hover");
          canvas.classList.toggle(
            "has-closed-book-hover",
            detailBookHovered
          );
        }
        return;
      }
      detailBookHovered = false;
      canvas.classList.remove("has-page-hover", "has-closed-book-hover");
      if (mode !== "hero") {
        setHovered(-1);
        return;
      }
      setHovered(bookIndexAtPointer());
    }

    function bookIndexAtPointer() {
      raycaster.setFromCamera(pointer.ndc, camera);
      const hits = raycaster.intersectObjects(hitTargets, false);
      return hits.length ? hits[0].object.userData.index : -1;
    }

    function activeBookAtPointer() {
      if (mode !== "detail" || !activeBook) return false;
      activeBook.root.updateWorldMatrix(true, true);
      raycaster.setFromCamera(pointer.ndc, camera);
      return raycaster.intersectObject(activeBook.hit, false).length > 0;
    }

    function pageSurfaceAtPointer() {
      if (mode !== "detail" || !activeBook || !readingOpen) return null;
      activeBook.root.updateWorldMatrix(true, true);
      raycaster.setFromCamera(pointer.ndc, camera);
      const hits = raycaster.intersectObjects(
        activeBook.pageGestureSurfaces,
        false
      );
      return hits.length ? hits[0].object : null;
    }

    function coverSurfaceAtPointer() {
      if (
        mode !== "detail"
        || !activeBook
        || currentSpread !== 0
      ) return null;
      activeBook.root.updateWorldMatrix(true, true);
      raycaster.setFromCamera(pointer.ndc, camera);
      const hits = raycaster.intersectObject(activeBook.frontCover, false);
      return hits.length ? hits[0].object : null;
    }

    function resetPageDrag() {
      const capturedPointerId = pageDrag.pointerId;
      pageDrag.active = false;
      pageDrag.pointerId = null;
      pageDrag.progress = 0;
      pageDrag.peakProgress = 0;
      pageDrag.committed = false;
      pageDrag.progressVelocity = 0;
      pageDrag.verticalBias = 0;
      pageDrag.lastProgress = 0;
      pageDrag.lastTime = 0;
      pageDrag.direction = 0;
      pageDrag.kind = null;
      canvas.classList.remove("is-page-dragging");
      controls.enabled = mode === "detail";
      if (
        capturedPointerId !== null
        && canvas.hasPointerCapture?.(capturedPointerId)
      ) {
        canvas.releasePointerCapture(capturedPointerId);
      }
    }

    function applyPageReleaseImpulse(turnDirection) {
      if (!activeBook || turnDirection === 0) return;
      const leafOrder = turnDirection > 0
        ? currentSpread
        : currentSpread - 1;
      const pageIndex = activeBook.pagePivots.length - 1 - leafOrder;
      const pagePivot = activeBook.pagePivots[pageIndex];
      const flex = pagePivot?.userData.flex;
      if (!flex) return;

      const speedResponse = clamp(
        Math.abs(pageDrag.progressVelocity) / 5.5,
        0.12,
        1
      );
      flex.curveVelocity = clamp(
        flex.curveVelocity + speedResponse * 0.46,
        -1.8,
        1.8
      );
      flex.twistVelocity = clamp(
        flex.twistVelocity
          + pageDrag.verticalBias * 0.38
          + clamp(
              pageDrag.progressVelocity / 5.5,
              -1,
              1
            ) * turnDirection * 0.14,
        -1.6,
        1.6
      );
    }

    function settlePageDrag(commitLatchedGesture = false) {
      if (!pageDrag.active) return false;
      const turnDirection = pageDrag.direction;
      const shouldCloseCover = commitLatchedGesture
        && pageDrag.kind === "cover-close"
        && pageDrag.committed;
      const shouldOpenCover = commitLatchedGesture
        && pageDrag.kind === "cover-open"
        && pageDrag.committed;
      const shouldTurnPage = commitLatchedGesture
        && pageDrag.kind === "page"
        && pageDrag.committed
        && turnDirection !== 0;
      if (shouldTurnPage) {
        applyPageReleaseImpulse(turnDirection);
      }
      resetPageDrag();
      if (shouldCloseCover) {
        setReadingOpen(false);
      } else if (shouldOpenCover) {
        setReadingOpen(true);
      } else if (shouldTurnPage) {
        turnPage(turnDirection);
      } else {
        requestFrame();
      }
      return shouldCloseCover || shouldOpenCover || shouldTurnPage;
    }

    function cancelPageDrag() {
      settlePageDrag(false);
    }

    function resetDetailPress() {
      detailPress.active = false;
      detailPress.pointerId = null;
      detailPress.moved = false;
      detailPress.allowClick = false;
    }

    function onDetailBookPointerDown(event) {
      if (
        mode !== "detail"
        || readingOpen
        || event.button !== 0
        || event.isPrimary === false
      ) return;

      setPointerFromEvent(event);
      detailPress.allowClick = false;
      if (!activeBookAtPointer()) return;
      detailPress.active = true;
      detailPress.pointerId = event.pointerId;
      detailPress.startX = event.clientX;
      detailPress.startY = event.clientY;
      detailPress.moved = false;
    }

    function onDetailBookPointerMove(event) {
      if (!detailPress.active || event.pointerId !== detailPress.pointerId) return;
      if (
        Math.hypot(
          event.clientX - detailPress.startX,
          event.clientY - detailPress.startY
        ) > 16
      ) {
        detailPress.moved = true;
      }
    }

    function onDetailBookPointerEnd(event) {
      if (!detailPress.active || event.pointerId !== detailPress.pointerId) return;
      detailPress.allowClick = event.type === "pointerup" && !detailPress.moved;
      detailPress.active = false;
      detailPress.pointerId = null;
    }

    function onPagePointerDown(event) {
      if (
        mode !== "detail"
        || !activeBook
        || event.button !== 0
        || event.isPrimary === false
      ) return;

      setPointerFromEvent(event);
      const coverSurface = coverSurfaceAtPointer();
      const pageSurface = readingOpen ? pageSurfaceAtPointer() : null;
      if (!coverSurface && !pageSurface) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      pageDrag.active = true;
      pageDrag.pointerId = event.pointerId;
      pageDrag.startX = event.clientX;
      pageDrag.startY = event.clientY;
      pageDrag.progress = 0;
      pageDrag.peakProgress = 0;
      pageDrag.committed = false;
      pageDrag.progressVelocity = 0;
      pageDrag.verticalBias = 0;
      pageDrag.lastProgress = 0;
      pageDrag.lastTime = event.timeStamp || performance.now();
      pageDrag.direction = 0;
      pageDrag.kind = coverSurface
        ? readingOpen
          ? "cover-close"
          : "cover-open"
        : "page";
      controls.enabled = false;
      canvas.classList.add("has-page-hover", "is-page-dragging");
      canvas.setPointerCapture?.(event.pointerId);
      requestFrame();
    }

    function updatePageDragMotion(event, deltaY) {
      const eventTime = event.timeStamp || performance.now();
      const elapsed = clamp(
        (eventTime - pageDrag.lastTime) / 1000,
        0.008,
        0.08
      );
      const instantVelocity = clamp(
        (pageDrag.progress - pageDrag.lastProgress) / elapsed,
        -8,
        8
      );
      pageDrag.progressVelocity = lerp(
        pageDrag.progressVelocity,
        instantVelocity,
        0.42
      );
      pageDrag.verticalBias = lerp(
        pageDrag.verticalBias,
        clamp(deltaY / 180, -1, 1),
        0.36
      );
      pageDrag.lastProgress = pageDrag.progress;
      pageDrag.lastTime = eventTime;
    }

    function updatePageDragFromEvent(event) {
      setPointerFromEvent(event);

      const deltaX = event.clientX - pageDrag.startX;
      const deltaY = event.clientY - pageDrag.startY;
      const horizontalDistance = Math.abs(deltaX);

      if (
        pageDrag.kind === "cover-open"
        || pageDrag.kind === "cover-close"
      ) {
        const openingCover = pageDrag.kind === "cover-open";
        const signedDistance = openingCover ? -deltaX : deltaX;
        const commitProgress = openingCover
          ? COVER_OPEN_COMMIT_PROGRESS
          : COVER_CLOSE_COMMIT_PROGRESS;
        pageDrag.direction = 0;
        pageDrag.progress = (
          horizontalDistance >= 3
          && horizontalDistance >= Math.abs(deltaY) * 0.72
        )
          ? clamp(Math.max(0, signedDistance) / 140, 0, 1)
          : 0;
        pageDrag.peakProgress = Math.max(
          pageDrag.peakProgress,
          pageDrag.progress
        );
        if (pageDrag.peakProgress >= commitProgress) {
          pageDrag.committed = true;
        }
        updatePageDragMotion(event, deltaY);
        return;
      }

      if (
        horizontalDistance < 3
        || horizontalDistance < Math.abs(deltaY) * 0.72
      ) {
        pageDrag.progress = 0;
      } else {
        if (pageDrag.direction === 0 && horizontalDistance >= 6) {
          const direction = deltaX < 0 ? 1 : -1;
          const directionAvailable = direction > 0
            ? currentSpread < SPREAD_COUNT - 1
            : currentSpread > 0;
          pageDrag.direction = directionAvailable ? direction : 0;
        }

        const signedDistance = pageDrag.direction > 0 ? -deltaX : deltaX;
        pageDrag.progress = pageDrag.direction !== 0
          ? clamp(Math.max(0, signedDistance) / 150, 0, 1)
          : 0;
        pageDrag.peakProgress = Math.max(
          pageDrag.peakProgress,
          pageDrag.progress
        );
        if (pageDrag.peakProgress >= PAGE_TURN_COMMIT_PROGRESS) {
          pageDrag.committed = true;
        }
      }
      updatePageDragMotion(event, deltaY);
    }

    function onPagePointerMove(event) {
      if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      updatePageDragFromEvent(event);

      requestFrame();
    }

    function onPagePointerEnd(event) {
      if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "pointerup") updatePageDragFromEvent(event);
      const dragKind = pageDrag.kind;
      const releaseDistance = Math.hypot(
        event.clientX - pageDrag.startX,
        event.clientY - pageDrag.startY
      );
      const shouldClickOpen = event.type === "pointerup"
        && dragKind === "cover-open"
        && !pageDrag.committed
        && releaseDistance <= 12;
      if (pageDrag.committed) {
        settlePageDrag(true);
      } else if (shouldClickOpen) {
        resetPageDrag();
        detailPress.allowClick = false;
        setReadingOpen(true);
      } else {
        if (dragKind === "cover-open") {
          detailPress.allowClick = false;
        }
        cancelPageDrag();
      }
    }

    function onWindowPagePointerEnd(event) {
      if (!pageDrag.active || event.pointerId !== pageDrag.pointerId) return;
      if (event.type === "pointerup") updatePageDragFromEvent(event);
      settlePageDrag(true);
    }

    function setHovered(index) {
      if (hoveredIndex === index) return;
      hoveredIndex = index;
      canvas.classList.toggle("has-book-hover", index >= 0);
      if (index >= 0) {
        const book = BOOKS[index];
        pointerLabelIndex.textContent = `Volume ${pad(index + 1)}`;
        pointerLabelTitle.textContent = book.title;
        pointerLabel.setAttribute("aria-hidden", "false");
      } else {
        pointerLabel.setAttribute("aria-hidden", "true");
      }
      requestFrame();
    }

    function positionPointerLabel() {
      pointerLabel.style.left = `${pointer.clientX}px`;
      pointerLabel.style.top = `${pointer.clientY}px`;
    }

    function onPointerMove(event) {
      setPointerFromEvent(event);
      positionPointerLabel();
      requestFrame();
    }

    function onPointerLeave() {
      pointer.ndc.set(3, 3);
      pointerDirty = false;
      detailBookHovered = false;
      setHovered(-1);
      if (!pageDrag.active) {
        canvas.classList.remove("has-page-hover", "has-closed-book-hover");
      }
    }

    function onCanvasClick(event) {
      if (mode === "detail" && !readingOpen && event.button === 0) {
        if (!detailPress.allowClick) return;
        detailPress.allowClick = false;
        setPointerFromEvent(event);
        if (!activeBookAtPointer()) return;
        event.preventDefault();
        setReadingOpen(true);
        return;
      }
      if (mode !== "hero" || event.button !== 0) return;
      setPointerFromEvent(event);
      const clickedBookIndex = bookIndexAtPointer();
      if (clickedBookIndex < 0) return;
      event.preventDefault();
      selectMarker(clickedBookIndex, canvas);
      openDetail(canvas);
    }

    function onWheel(event) {
      if (mode !== "hero") return;
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      targetPosition += clamp(delta * 0.0022, -0.72, 0.72);
      wheelIdle = 0.14;
      requestFrame();
    }

    function openDetail(origin = inspectButton) {
      if (mode !== "hero") return;
      mode = "opening";
      transitionTime = 0;
      readingOpen = false;
      detailBookHovered = false;
      currentSpread = 0;
      resetDetailPress();
      focusReturnTarget = origin === canvas
        ? markers.children[selectedIndex] || inspectButton
        : origin instanceof HTMLElement
          ? origin
          : inspectButton;
      activeBook = bookRigs[selectedIndex];
      activeBook.contactShadow.visible = false;
      populateDetail(activeBook.data);
      updatePageControls(false);
      detailPanel.inert = false;
      detailPanel.setAttribute("aria-hidden", "false");
      browseUi.inert = true;
      experience.classList.add("mode-detail", "is-opening");
      pointerLabel.setAttribute("aria-hidden", "true");
      setHovered(-1);

      activeBook.root.updateWorldMatrix(true, true);
      activeBook.root.matrixWorld.decompose(
        openingBookPosition,
        openingBookQuaternion,
        openingBookScale
      );
      openingCameraPosition.copy(camera.position);
      openingCameraTarget.copy(transitionCameraTarget);
      openingShelfPosition.copy(shelfStage.position);
      openingMotionPosition.copy(activeBook.motion.position);
      openingMotionQuaternion.copy(activeBook.motion.quaternion);
      openingViewOffsetX = currentViewOffsetX;
      scene.add(activeBook.root);
      activeBook.root.position.copy(openingBookPosition);
      activeBook.root.quaternion.copy(openingBookQuaternion);
      activeBook.root.scale.copy(openingBookScale);
      applyDetailViewOffset();
      controls.enabled = false;
      liveRegion.textContent = `Opening a closed copy of ${activeBook.data.title}. Drag the cover, click the book, or use Open book to begin reading.`;

      if (reducedMotion) {
        finishOpening();
      }
      requestFrame();
    }

    function applyOpeningPose(progress) {
      const eased = smootherstep(clamp(progress, 0, 1));
      const shelfClearEased = smootherstep(clamp(progress / 0.68, 0, 1));
      inspectBookScale.setScalar(getInspectScale());
      shelfStage.position.lerpVectors(
        openingShelfPosition,
        inspectShelfPosition,
        shelfClearEased
      );
      activeBook.root.position.lerpVectors(
        openingBookPosition,
        inspectPosition,
        eased
      );
      activeBook.root.quaternion.slerpQuaternions(
        openingBookQuaternion,
        inspectBookQuaternion,
        eased
      );
      activeBook.root.scale.lerpVectors(
        openingBookScale,
        inspectBookScale,
        eased
      );
      activeBook.motion.position.lerpVectors(
        openingMotionPosition,
        restingMotionPosition,
        eased
      );
      activeBook.motion.quaternion.slerpQuaternions(
        openingMotionQuaternion,
        restingMotionQuaternion,
        eased
      );
      camera.position.lerpVectors(
        openingCameraPosition,
        inspectCameraPosition,
        eased
      );
      transitionCameraTarget.lerpVectors(
        openingCameraTarget,
        inspectCameraTarget,
        eased
      );
      currentViewOffsetX = lerp(openingViewOffsetX, detailViewOffsetX, eased);
      applyDetailViewOffset();
      camera.lookAt(transitionCameraTarget);
    }

    function finishOpening() {
      if (!activeBook) return;
      applyOpeningPose(1);
      mode = "detail";
      transitionTime = 1;
      controls.target.copy(inspectCameraTarget);
      controls.enabled = true;
      controls.enableDamping = !reducedMotion;
      controls.update();
      updatePageControls(false);
      experience.classList.remove("is-opening");
      closeButton.focus({ preventScroll: true });
    }

    function closeDetail() {
      if (mode !== "detail") return;
      cancelPageDrag();
      resetDetailPress();
      mode = "closing";
      transitionTime = 0;
      readingOpen = false;
      detailBookHovered = false;
      currentSpread = 0;
      canvas.classList.remove("has-page-hover", "has-closed-book-hover");
      updatePageControls(false);
      controls.enabled = false;
      closingBookStartPosition.copy(activeBook.root.position);
      closingBookStartQuaternion.copy(activeBook.root.quaternion);
      closingBookStartScale.copy(activeBook.root.scale);
      closingMotionPosition.copy(activeBook.motion.position);
      closingMotionQuaternion.copy(activeBook.motion.quaternion);
      closingCameraPosition.copy(camera.position);
      closingCameraTarget.copy(controls.target);
      closingShelfPosition.copy(shelfStage.position);
      closingViewOffsetX = currentViewOffsetX;
      transitionCameraTarget.copy(closingCameraTarget);
      experience.classList.remove("is-opening");
      alignShelfToSelection();
      closingBookPosition.set(
        0,
        shelfBoardTop + activeBook.base.height * 0.5 + 0.15,
        0.37
      );
      bookRigs.forEach((rig, index) => {
        if (rig !== activeBook && rig.root.parent === shelfStage) {
          snapRigToShelfSlot(rig, index);
        }
      });
      experience.classList.remove("mode-detail");
      if (detailPanel.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      detailPanel.setAttribute("aria-hidden", "true");
      detailPanel.inert = true;
      liveRegion.textContent = `Returning ${activeBook.data.title} to the shelf.`;
      if (reducedMotion) {
        finishClosing();
      }
      requestFrame();
    }

    function applyClosingPose(progress) {
      const eased = smootherstep(clamp(progress, 0, 1));
      const shelfReturnEased = smootherstep(
        clamp((progress - 0.24) / 0.76, 0, 1)
      );
      shelfStage.position.lerpVectors(
        closingShelfPosition,
        shelfRestPosition,
        shelfReturnEased
      );
      activeBook.root.position.lerpVectors(
        closingBookStartPosition,
        closingBookPosition,
        eased
      );
      activeBook.root.quaternion.slerpQuaternions(
        closingBookStartQuaternion,
        closingBookQuaternion,
        eased
      );
      activeBook.root.scale.lerpVectors(
        closingBookStartScale,
        closingBookScale,
        eased
      );
      activeBook.motion.position.lerpVectors(
        closingMotionPosition,
        restingMotionPosition,
        eased
      );
      activeBook.motion.quaternion.slerpQuaternions(
        closingMotionQuaternion,
        restingMotionQuaternion,
        eased
      );
      camera.position.lerpVectors(
        closingCameraPosition,
        shelfCameraPosition,
        eased
      );
      transitionCameraTarget.lerpVectors(
        closingCameraTarget,
        shelfCameraTarget,
        eased
      );
      currentViewOffsetX = lerp(closingViewOffsetX, 0, eased);
      applyDetailViewOffset();
      camera.lookAt(transitionCameraTarget);
    }

    function finishClosing() {
      if (!activeBook) return;
      applyClosingPose(1);
      shelfStage.attach(activeBook.root);
      snapRigToShelfSlot(activeBook, selectedIndex);
      activeBook.contactShadow.visible = true;
      controls.target.copy(shelfCameraTarget);
      browseUi.inert = false;
      mode = "hero";
      transitionTime = 0;
      activeBook = null;
      liveRegion.textContent = `${BOOKS[selectedIndex].title} returned to the shelf.`;
      requestAnimationFrame(() => focusReturnTarget?.focus?.({ preventScroll: true }));
    }

    function resetInspectionView() {
      if (mode !== "detail") return;
      camera.position.copy(inspectCameraPosition);
      controls.target.copy(inspectCameraTarget);
      controls.update();
      liveRegion.textContent = `Inspection view reset for ${BOOKS[selectedIndex].title}.`;
      requestFrame();
    }

    function updateShelfLayout(delta, elapsed) {
      if (mode === "hero") {
        position = reducedMotion
          ? targetPosition
          : damp(position, targetPosition, 9.5, delta);
        if (Math.abs(position - targetPosition) < 0.0005) position = targetPosition;

        if (wheelIdle > 0) {
          wheelIdle -= delta;
          if (wheelIdle <= 0) targetPosition = Math.round(targetPosition);
        }

        const nearest = mod(Math.round(position), BOOKS.length);
        if (nearest !== selectedIndex) updateSelection(nearest, false);
      }

      bookRigs.forEach((rig, index) => {
        if (rig.root.parent !== shelfStage) return;

        let offset = index - position;
        offset -= Math.round(offset / BOOKS.length) * BOOKS.length;
        const distance = Math.abs(offset);
        const wrappedAcrossSeam = rig.lastOffset !== null
          && Math.abs(offset - rig.lastOffset) > BOOKS.length * 0.5;
        const focus = 1 - clamp(distance, 0, 1);
        const targetX = offset * spacing;
        const targetY = shelfBoardTop + rig.base.height * 0.5 + focus * 0.15;
        const targetZ = 0.13 + focus * 0.24 - Math.min(distance, 2.8) * 0.07;
        const targetRotationY = -offset * 0.105;
        const targetRotationZ = -offset * 0.018;
        const targetScale = 1 + focus * 0.09;
        const speed = reducedMotion ? 1000 : 12;

        if (wrappedAcrossSeam) {
          rig.root.position.x = targetX;
          rig.opacity = 0;
        }
        rig.lastOffset = offset;

        rig.root.position.x = damp(rig.root.position.x, targetX, speed, delta);
        rig.root.position.y = damp(rig.root.position.y, targetY, speed, delta);
        rig.root.position.z = damp(rig.root.position.z, targetZ, speed, delta);
        rig.root.rotation.y = damp(rig.root.rotation.y, targetRotationY, speed, delta);
        rig.root.rotation.z = damp(rig.root.rotation.z, targetRotationZ, speed, delta);
        const nextScale = damp(rig.root.scale.x, targetScale, speed, delta);
        rig.root.scale.setScalar(nextScale);

        const fadeProgress = clamp((distance - 2.55) / 0.7, 0, 1);
        const targetOpacity = 1 - smoothstep(fadeProgress);
        rig.opacity = reducedMotion
          ? targetOpacity
          : damp(rig.opacity, targetOpacity, 18, delta);
        rig.fadeMaterials.forEach((material) => {
          material.opacity = rig.opacity;
        });
        rig.contactShadow.visible = true;
        rig.contactShadow.material.opacity = rig.opacity * 0.24;
        rig.hit.visible = rig.opacity > 0.12;

        const isHovered = hoveredIndex === index && mode === "hero";
        const hoverPreview = isHovered && !reducedMotion;
        const hoverAngle = hoverPreview ? -0.085 : 0;
        rig.frontPivot.rotation.y = damp(
          rig.frontPivot.rotation.y,
          hoverAngle,
          reducedMotion ? 1000 : 13,
          delta
        );
        rig.pagePivots.forEach((pagePivot) => {
          pagePivot.rotation.y = damp(
            pagePivot.rotation.y,
            0,
            reducedMotion ? 1000 : 13,
            delta
          );
          pagePivot.rotation.z = damp(
            pagePivot.rotation.z,
            0,
            reducedMotion ? 1000 : 13,
            delta
          );
          updateFlexiblePage(pagePivot, 0, delta);
        });

        const idle = reducedMotion ? 0 : Math.sin(elapsed * 0.72 + index * 0.8) * 0.012 * focus;
        rig.motion.position.y = damp(rig.motion.position.y, idle + (hoverPreview ? 0.035 : 0), 9, delta);
        rig.motion.rotation.x = damp(
          rig.motion.rotation.x,
          hoverPreview ? pointer.ndc.y * 0.035 : 0,
          10,
          delta
        );
        rig.motion.rotation.y = damp(
          rig.motion.rotation.y,
          hoverPreview ? -pointer.ndc.x * 0.035 : 0,
          10,
          delta
        );
      });
    }

    function updateTransition(delta) {
      if (mode === "opening") {
        transitionTime = Math.min(
          1,
          transitionTime + delta / DETAIL_TRANSITION_DURATION
        );
        applyOpeningPose(transitionTime);
        updatePaginatedBook(activeBook, delta, 0);
        if (transitionTime >= 1) finishOpening();
      } else if (mode === "closing") {
        transitionTime = Math.min(
          1,
          transitionTime + delta / SHELF_TRANSITION_DURATION
        );
        applyClosingPose(transitionTime);
        updatePaginatedBook(activeBook, delta, 0);
        if (transitionTime >= 1) finishClosing();
      } else if (mode === "hero") {
        shelfStage.position.y = damp(shelfStage.position.y, 0, 10, delta);
        shelfStage.position.z = damp(shelfStage.position.z, 0, 10, delta);
        camera.position.x = damp(camera.position.x, shelfCameraPosition.x, 8, delta);
        camera.position.y = damp(camera.position.y, shelfCameraPosition.y, 8, delta);
        camera.position.z = damp(camera.position.z, shelfCameraPosition.z, 8, delta);
        transitionCameraTarget.copy(shelfCameraTarget);
        currentViewOffsetX = 0;
        applyDetailViewOffset();
        camera.lookAt(shelfCameraTarget);
      }
    }

    function updateDust(elapsed) {
      if (reducedMotion) return;
      const dust = scene.getObjectByName("paper-dust");
      if (dust) {
        dust.rotation.y = elapsed * 0.012;
        dust.position.y = Math.sin(elapsed * 0.17) * 0.025;
      }
    }

    function requestFrame() {
      if (!rafId && !suspended) {
        rafId = requestAnimationFrame(frame);
      }
    }

    function getDetailOpenAmount() {
      if (pageDrag.active && pageDrag.kind === "cover-open") {
        return smoothstep(pageDrag.progress);
      }
      if (!readingOpen) return 0;
      if (pageDrag.active && pageDrag.kind === "cover-close") {
        return 1 - smoothstep(pageDrag.progress);
      }
      return 1;
    }

    function frame(time) {
      rafId = 0;
      const delta = Math.min((time - lastTime) / 1000, 0.05);
      const elapsed = time / 1000;
      lastTime = time;

      if (pointerDirty) updateHover();
      updateShelfLayout(delta, elapsed);
      updateTransition(delta);
      updateDust(elapsed);
      const themeIsMoving = updateTheme(delta);

      if (mode === "detail") {
        if (pageDrag.active) {
          pageDrag.progressVelocity = damp(
            pageDrag.progressVelocity,
            0,
            9,
            delta
          );
        }
        controls.update();
        updatePaginatedBook(activeBook, delta, getDetailOpenAmount());
      }

      renderer.render(scene, camera);

      const shelfMoving = Math.abs(position - targetPosition) > 0.0005 || wheelIdle > 0;
      const shouldContinue = !reducedMotion
        || mode === "opening"
        || mode === "closing"
        || shelfMoving
        || themeIsMoving;
      if (shouldContinue && !suspended) requestFrame();
    }

    function resize() {
      viewWidth = window.innerWidth;
      viewHeight = window.innerHeight;
      configureResponsiveTargets();
      renderer.setSize(viewWidth, viewHeight, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, viewWidth < 820 ? 1.5 : 2));
      camera.aspect = viewWidth / viewHeight;
      camera.updateProjectionMatrix();

      if (mode === "hero") {
        camera.position.copy(shelfCameraPosition);
        transitionCameraTarget.copy(shelfCameraTarget);
        currentViewOffsetX = 0;
        applyDetailViewOffset();
        camera.lookAt(shelfCameraTarget);
      } else if (mode === "detail" && activeBook) {
        activeBook.root.position.copy(inspectPosition);
        activeBook.root.scale.setScalar(getInspectScale());
        transitionCameraTarget.copy(inspectCameraTarget);
        currentViewOffsetX = detailViewOffsetX;
        applyDetailViewOffset();
        resetInspectionView();
      }
      requestFrame();
    }

    function onKeyDown(event) {
      if (event.key === "Escape" && mode === "detail") {
        event.preventDefault();
        closeDetail();
        return;
      }

      if (
        mode === "detail"
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        turnPage(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }

      if (mode === "detail" && event.key === "Tab") {
        const focusables = [
          closeButton,
          toggleBookButton,
          previousPageButton,
          nextPageButton,
          resetButton
        ].filter((element) => !element.disabled);
        const current = focusables.indexOf(document.activeElement);
        const next = event.shiftKey
          ? (current <= 0 ? focusables.length - 1 : current - 1)
          : (current >= focusables.length - 1 ? 0 : current + 1);
        event.preventDefault();
        focusables[next].focus();
        return;
      }

      if (mode !== "hero" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigate(-1, document.activeElement);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        navigate(1, document.activeElement);
      } else if ((event.key === "Enter" || event.key === " ") && document.activeElement === inspectButton) {
        event.preventDefault();
        openDetail(inspectButton);
      }
    }

    function onVisibilityChange() {
      suspended = document.hidden;
      if (!suspended) {
        lastTime = performance.now();
        requestFrame();
      } else {
        settlePageDrag(true);
        resetDetailPress();
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      }
    }

    function onWindowBlur() {
      settlePageDrag(true);
      resetDetailPress();
    }

    function onReducedMotionChange(event) {
      cancelPageDrag();
      resetDetailPress();
      reducedMotion = event.matches;
      controls.enableDamping = !reducedMotion;
      if (reducedMotion) {
        position = targetPosition;
      }
      requestFrame();
    }

    function showFallback(message) {
      loading.hidden = true;
      experience.classList.remove("webgl-ready");
      fallbackStatus.textContent = message;
    }

    function handleContextLost(event) {
      event.preventDefault();
      cancelPageDrag();
      resetDetailPress();
      suspended = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      showFallback("The 3D view paused after losing its graphics context. The complete static catalog remains available; reload to restore inspection.");
    }

    function disposeExperience() {
      suspended = true;
      cancelPageDrag();
      resetDetailPress();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;

      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onCanvasClick);
      canvas.removeEventListener("pointerdown", onDetailBookPointerDown, true);
      canvas.removeEventListener("pointermove", onDetailBookPointerMove, true);
      canvas.removeEventListener("pointerup", onDetailBookPointerEnd, true);
      canvas.removeEventListener("pointercancel", onDetailBookPointerEnd, true);
      canvas.removeEventListener("lostpointercapture", onDetailBookPointerEnd, true);
      canvas.removeEventListener("pointerdown", onPagePointerDown, true);
      canvas.removeEventListener("pointermove", onPagePointerMove, true);
      canvas.removeEventListener("pointerup", onPagePointerEnd, true);
      canvas.removeEventListener("pointercancel", onPagePointerEnd, true);
      canvas.removeEventListener("lostpointercapture", onPagePointerEnd, true);
      window.removeEventListener("pointerup", onWindowPagePointerEnd);
      window.removeEventListener("pointercancel", onWindowPagePointerEnd);
      experience.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);

      controls?.dispose();
      scene?.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value?.isTexture) value.dispose();
          });
          material.dispose();
        });
      });
      environmentTarget?.dispose();
      renderer?.dispose();
    }

    async function initialize() {
      const woodTexturePromise = woodTextureImage.decode().then(
        () => true,
        () => false
      );

      try {
        await document.fonts.load("600 82px Inter");
      } catch (error) {
        // The system sans-serif fallback keeps the interface usable offline.
      }

      try {
        await coverAtlasImage.decode();
        coverAtlasReady = true;
      } catch (error) {
        coverAtlasReady = false;
      }

      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          powerPreference: "high-performance"
        });
      } catch (error) {
        showFallback("WebGL is unavailable in this browser. The complete static catalog remains available.");
        return;
      }

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.9;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setClearColor(0x000000, 0);

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0xe9dfcb, 0.027);
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      environmentTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = environmentTarget.texture;
      scene.environmentIntensity = 0.72;
      pmremGenerator.dispose();

      camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
      shelfStage = new THREE.Group();
      shelfStage.name = "continuous-shelf-stage";
      scene.add(shelfStage);

      configureResponsiveTargets();
      camera.position.copy(shelfCameraPosition);
      camera.lookAt(shelfCameraTarget);

      controls = new OrbitControls(camera, canvas);
      controls.enabled = false;
      controls.enableDamping = !reducedMotion;
      controls.dampingFactor = 0.075;
      controls.enablePan = true;
      controls.screenSpacePanning = true;
      controls.minDistance = 2.8;
      controls.maxDistance = 7.2;
      controls.minPolarAngle = Math.PI * 0.24;
      controls.maxPolarAngle = Math.PI * 0.76;
      controls.target.copy(shelfCameraTarget);
      controls.addEventListener("change", requestFrame);

      RectAreaLightUniformsLib.init();
      addRoom();
      addLights();
      buildMarkers();

      bookRigs = BOOKS.map((book, index) => {
        const rig = createBookRig(book, index);
        shelfStage.add(rig.root);
        return rig;
      });

      updateSelection(0, true);
      resize();

      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerleave", onPointerLeave);
      canvas.addEventListener("click", onCanvasClick);
      canvas.addEventListener("pointerdown", onDetailBookPointerDown, { capture: true });
      canvas.addEventListener("pointermove", onDetailBookPointerMove, { capture: true });
      canvas.addEventListener("pointerup", onDetailBookPointerEnd, { capture: true });
      canvas.addEventListener("pointercancel", onDetailBookPointerEnd, { capture: true });
      canvas.addEventListener("lostpointercapture", onDetailBookPointerEnd, { capture: true });
      canvas.addEventListener("pointerdown", onPagePointerDown, { capture: true });
      canvas.addEventListener("pointermove", onPagePointerMove, { capture: true });
      canvas.addEventListener("pointerup", onPagePointerEnd, { capture: true });
      canvas.addEventListener("pointercancel", onPagePointerEnd, { capture: true });
      canvas.addEventListener("lostpointercapture", onPagePointerEnd, { capture: true });
      window.addEventListener("pointerup", onWindowPagePointerEnd);
      window.addEventListener("pointercancel", onWindowPagePointerEnd);
      experience.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("webglcontextlost", handleContextLost);
      window.addEventListener("resize", resize);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("blur", onWindowBlur);
      document.addEventListener("visibilitychange", onVisibilityChange);
      reducedMotionQuery.addEventListener("change", onReducedMotionChange);

      previousButton.addEventListener("click", () => navigate(-1, previousButton));
      nextButton.addEventListener("click", () => navigate(1, nextButton));
      inspectButton.addEventListener("click", () => openDetail(inspectButton));
      closeButton.addEventListener("click", closeDetail);
      toggleBookButton.addEventListener("click", () => setReadingOpen(!readingOpen));
      previousPageButton.addEventListener("click", () => turnPage(-1));
      nextPageButton.addEventListener("click", () => turnPage(1));
      resetButton.addEventListener("click", resetInspectionView);
      if (practiceButton) {
        practiceButton.addEventListener("click", () => {
          const book = BOOKS[selectedIndex];
          if (book && book.practiceUrl) {
            // Mở ở tab mới (top-level), không điều hướng bên trong iframe
            // #shelfModalFrame — tránh mất luôn cảnh 3D khi học sinh/GV
            // bấm xong quay lại. Đường dẫn tương đối được resolve theo
            // vị trí của chính quiz-shelf.html (cùng thư mục gốc dự án
            // với word-simulator.html) nên vẫn đúng dù trang này đang
            // được nhúng trong iframe của dashboard.
            window.open(book.practiceUrl, "_blank", "noopener");
          }
        });
      }

      renderer.render(scene, camera);
      loading.hidden = true;
      experience.classList.add("webgl-ready");
      requestFrame();

      woodTexturePromise.then((ready) => {
        if (!ready || suspended || !renderer) return;
        woodTextureReady = true;
        applyWoodTexture();
      });
    }

    initialize().catch(() => {
      showFallback("The interactive shelf could not be prepared. The complete static catalog remains available.");
    });
    window.addEventListener("beforeunload", disposeExperience, { once: true });
