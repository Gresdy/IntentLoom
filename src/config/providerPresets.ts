/**
 * Provider preset configurations for IntentLoom
 * 参考 cc-switch: https://github.com/your-repo/cc-switch
 */

export interface ProviderPreset {
  name: string;
  websiteUrl: string;
  apiKeyUrl?: string;
  settingsConfig: {
    env?: Record<string, string>;
    [key: string]: any;
  };
  category: "official" | "cn_official" | "aggregator" | "third_party" | "cloud_provider";
  icon?: string;
  iconColor?: string;
  isPartner?: boolean;
}

export const claudeProviderPresets: ProviderPreset[] = [
  {
    name: "Claude Official",
    websiteUrl: "https://www.anthropic.com/claude-code",
    settingsConfig: { env: {} },
    category: "official",
    icon: "claude",
    iconColor: "#D4915D",
  },
  {
    name: "DeepSeek",
    websiteUrl: "https://platform.deepseek.com",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "DeepSeek-V3",
      },
    },
    category: "cn_official",
    icon: "deepseek",
    iconColor: "#1E88E5",
  },
  {
    name: "Zhipu GLM",
    websiteUrl: "https://open.bigmodel.cn",
    apiKeyUrl: "https://www.bigmodel.cn/claude-code",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "glm-5",
      },
    },
    category: "cn_official",
    icon: "zhipu",
    iconColor: "#0F62FE",
  },
  {
    name: "Zhipu GLM en",
    websiteUrl: "https://z.ai",
    apiKeyUrl: "https://z.ai/subscribe",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "glm-5",
      },
    },
    category: "cn_official",
    icon: "zhipu",
    iconColor: "#0F62FE",
  },
  {
    name: "Bailian",
    websiteUrl: "https://bailian.console.aliyun.com",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://dashscope.aliyuncs.com/apps/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "cn_official",
    icon: "bailian",
    iconColor: "#624AFF",
  },
  {
    name: "Bailian For Coding",
    websiteUrl: "https://bailian.console.aliyun.com",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "cn_official",
    icon: "bailian",
    iconColor: "#624AFF",
  },
  {
    name: "Kimi",
    websiteUrl: "https://platform.moonshot.cn/console",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.moonshot.cn/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "kimi-k2.5",
      },
    },
    category: "cn_official",
    icon: "kimi",
    iconColor: "#6366F1",
  },
  {
    name: "Kimi For Coding",
    websiteUrl: "https://www.kimi.com/coding/docs/",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "cn_official",
    icon: "kimi",
    iconColor: "#6366F1",
  },
  {
    name: "StepFun",
    websiteUrl: "https://platform.stepfun.ai",
    apiKeyUrl: "https://platform.stepfun.ai/interface-key",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.stepfun.ai/v1",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "step-3.5-flash",
      },
    },
    category: "cn_official",
    icon: "stepfun",
    iconColor: "#005AFF",
  },
  {
    name: "KAT-Coder",
    websiteUrl: "https://console.streamlake.ai",
    apiKeyUrl: "https://console.streamlake.ai/console/api-key",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://vanchin.streamlake.ai/api/gateway/v1/endpoints/${ENDPOINT_ID}/claude-code-proxy",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "KAT-Coder-Pro V1",
      },
    },
    category: "cn_official",
    icon: "catcoder",
  },
  {
    name: "Longcat",
    websiteUrl: "https://longcat.chat/platform",
    apiKeyUrl: "https://longcat.chat/platform/api_keys",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.longcat.chat/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "LongCat-Flash-Chat",
      },
    },
    category: "cn_official",
    icon: "longcat",
    iconColor: "#29E154",
  },
  {
    name: "MiniMax",
    websiteUrl: "https://platform.minimaxi.com",
    apiKeyUrl: "https://platform.minimaxi.com/subscribe/coding-plan",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.minimaxi.com/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "MiniMax-M2.7",
      },
    },
    category: "cn_official",
    isPartner: true,
    icon: "minimax",
    iconColor: "#FF6B6B",
  },
  {
    name: "MiniMax en",
    websiteUrl: "https://platform.minimax.io",
    apiKeyUrl: "https://platform.minimax.io/subscribe/coding-plan",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.minimax.io/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "MiniMax-M2.7",
      },
    },
    category: "cn_official",
    isPartner: true,
    icon: "minimax",
    iconColor: "#FF6B6B",
  },
  {
    name: "DouBaoSeed",
    websiteUrl: "https://www.volcengine.com/product/doubao",
    apiKeyUrl: "https://www.volcengine.com/product/doubao",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://ark.cn-beijing.volces.com/api/coding",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "doubao-seed-2.0-code-preview-latest",
      },
    },
    category: "cn_official",
    icon: "doubao",
    iconColor: "#3370FF",
  },
  {
    name: "BaiLing",
    websiteUrl: "https://alipaytbox.yuque.com/sxs0ba/ling/get_started",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.tbox.cn/api/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "Ling-2.5-1T",
      },
    },
    category: "cn_official",
  },
  {
    name: "Xiaomi MiMo",
    websiteUrl: "https://platform.xiaomimimo.com",
    apiKeyUrl: "https://platform.xiaomimimo.com/#/console/api-keys",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.xiaomimimo.com/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "mimo-v2-pro",
      },
    },
    category: "cn_official",
    icon: "xiaomimimo",
  },
  {
    name: "ModelScope",
    websiteUrl: "https://modelscope.cn",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api-inference.modelscope.cn",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "ZhipuAI/GLM-5",
      },
    },
    category: "aggregator",
    icon: "modelscope",
    iconColor: "#624AFF",
  },
  {
    name: "AiHubMix",
    websiteUrl: "https://aihubmix.com",
    apiKeyUrl: "https://aihubmix.com",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://aihubmix.com",
        ANTHROPIC_API_KEY: "",
      },
    },
    category: "aggregator",
    icon: "aihubmix",
    iconColor: "#006FFB",
  },
  {
    name: "SiliconFlow",
    websiteUrl: "https://siliconflow.cn",
    apiKeyUrl: "https://cloud.siliconflow.cn/i/drGuwc9k",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.siliconflow.cn",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "Pro/MiniMaxAI/MiniMax-M2.7",
      },
    },
    category: "aggregator",
    isPartner: true,
    icon: "siliconflow",
    iconColor: "#6E29F6",
  },
  {
    name: "SiliconFlow en",
    websiteUrl: "https://siliconflow.com",
    apiKeyUrl: "https://cloud.siliconflow.cn/i/drGuwc9k",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.siliconflow.com",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "MiniMaxAI/MiniMax-M2.7",
      },
    },
    category: "aggregator",
    isPartner: true,
    icon: "siliconflow",
    iconColor: "#000000",
  },
  {
    name: "DMXAPI",
    websiteUrl: "https://www.dmxapi.cn",
    apiKeyUrl: "https://www.dmxapi.cn",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://www.dmxapi.cn",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "aggregator",
    isPartner: true,
  },
  {
    name: "优云智算",
    websiteUrl: "https://www.compshare.cn",
    apiKeyUrl: "https://www.compshare.cn/coding-plan",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.modelverse.cn",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "aggregator",
    isPartner: true,
    icon: "ucloud",
  },
  {
    name: "OpenRouter",
    websiteUrl: "https://openrouter.ai",
    apiKeyUrl: "https://openrouter.ai/keys",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "anthropic/claude-sonnet-4.6",
      },
    },
    category: "aggregator",
    icon: "openrouter",
    iconColor: "#6566F1",
  },
  {
    name: "TheRouter",
    websiteUrl: "https://therouter.ai",
    apiKeyUrl: "https://dashboard.therouter.ai",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.therouter.ai",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_API_KEY: "",
        ANTHROPIC_MODEL: "anthropic/claude-sonnet-4.6",
      },
    },
    category: "aggregator",
    icon: "therouter",
  },
  {
    name: "Novita AI",
    websiteUrl: "https://novita.ai",
    apiKeyUrl: "https://novita.ai",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.novita.ai/anthropic",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "zai-org/glm-5",
      },
    },
    category: "aggregator",
    icon: "novita",
    iconColor: "#000000",
  },
  {
    name: "Nvidia",
    websiteUrl: "https://build.nvidia.com",
    apiKeyUrl: "https://build.nvidia.com/settings/api-keys",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://integrate.api.nvidia.com",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_MODEL: "moonshotai/kimi-k2.5",
      },
    },
    category: "aggregator",
    icon: "nvidia",
  },
  {
    name: "PackyCode",
    websiteUrl: "https://www.packyapi.com",
    apiKeyUrl: "https://www.packyapi.com/register",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://www.packyapi.com",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "third_party",
    isPartner: true,
    icon: "packycode",
  },
  {
    name: "CodeCubence",
    websiteUrl: "https://cubence.com",
    apiKeyUrl: "https://cubence.com/signup",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.cubence.com",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "third_party",
    isPartner: true,
    icon: "cubence",
  },
  {
    name: "AIGoCode",
    websiteUrl: "https://aigocode.com",
    apiKeyUrl: "https://aigocode.com/invite/CC-SWITCH",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.aigocode.com",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "third_party",
    isPartner: true,
    icon: "aigocode",
    iconColor: "#5B7FFF",
  },
  {
    name: "RightCode",
    websiteUrl: "https://www.right.codes",
    apiKeyUrl: "https://www.right.codes/register",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://www.right.codes/claude",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "third_party",
    isPartner: true,
    icon: "rc",
    iconColor: "#E96B2C",
  },
  {
    name: "AICodeMirror",
    websiteUrl: "https://www.aicodemirror.com",
    apiKeyUrl: "https://www.aicodemirror.com/register",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.aicodemirror.com/api/claudecode",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "third_party",
    isPartner: true,
    icon: "aicodemirror",
  },
  {
    name: "AICoding",
    websiteUrl: "https://aicoding.sh",
    apiKeyUrl: "https://aicoding.sh/i/CCSWITCH",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.aicoding.sh",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "third_party",
    isPartner: true,
    icon: "aicoding",
  },
  {
    name: "CrazyRouter",
    websiteUrl: "https://www.crazyrouter.com",
    apiKeyUrl: "https://www.crazyrouter.com/register",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://crazyrouter.com",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "third_party",
    isPartner: true,
    icon: "crazyrouter",
  },
  {
    name: "SSSAiCode",
    websiteUrl: "https://www.sssaicode.com",
    apiKeyUrl: "https://www.sssaicode.com/register",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://node-hk.sssaicode.com/api",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "third_party",
    isPartner: true,
    icon: "sssaicode",
  },
  {
    name: "CodeMicu",
    websiteUrl: "https://www.openclaudecode.cn",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://api.openclaudecode.cn",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "third_party",
    icon: "micu",
  },
  {
    name: "X-Code API",
    websiteUrl: "https://x-code.pro",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://x-code.pro",
        ANTHROPIC_AUTH_TOKEN: "",
      },
    },
    category: "third_party",
    icon: "xcode",
  },
  {
    name: "AWS Bedrock",
    websiteUrl: "https://aws.amazon.com/bedrock/",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://bedrock-runtime.us-west-2.amazonaws.com",
        AWS_ACCESS_KEY_ID: "",
        AWS_SECRET_ACCESS_KEY: "",
        AWS_REGION: "us-west-2",
        ANTHROPIC_MODEL: "anthropic.claude-sonnet-4-20250514",
      },
    },
    category: "cloud_provider",
    icon: "aws",
    iconColor: "#FF9900",
  },
];

export const codexProviderPresets: ProviderPreset[] = [
  {
    name: "ChatGPT (OAuth)",
    websiteUrl: "https://chat.openai.com",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://chatgpt.com/backend-api/codex",
        ANTHROPIC_MODEL: "gpt-5.4",
      },
    },
    category: "third_party",
    icon: "openai",
    iconColor: "#10A37F",
  },
];

export const geminiProviderPresets: ProviderPreset[] = [
  {
    name: "Google AI Studio",
    websiteUrl: "https://ai.google.dev",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: "https://generativelanguage.googleapis.com",
        ANTHROPIC_API_KEY: "",
        ANTHROPIC_MODEL: "gemini-2.5-pro",
      },
    },
    category: "official",
    icon: "gemini",
    iconColor: "#4285F4",
  },
];

export const opencodeProviderPresets: ProviderPreset[] = [];

export const openclawProviderPresets: ProviderPreset[] = [];

export function getPresetsForApp(appId: string): ProviderPreset[] {
  switch (appId) {
    case "claude":
      return claudeProviderPresets;
    case "codex":
      return codexProviderPresets;
    case "gemini":
      return geminiProviderPresets;
    case "opencode":
      return opencodeProviderPresets;
    case "openclaw":
      return openclawProviderPresets;
    default:
      return claudeProviderPresets;
  }
}

export const PRESET_CATEGORY_LABELS: Record<string, string> = {
  official: "官方",
  cn_official: "国内官方",
  aggregator: "聚合服务",
  third_party: "第三方",
  cloud_provider: "云服务商",
};
