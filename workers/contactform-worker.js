const VERSION = "petrair-lead-brief-2026-06-03-v9";

const DEFAULT_LEAD_EMAIL = "garryrobson85@googlemail.com";
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "yahoo.com",
  "proton.me",
  "protonmail.com",
  "aol.com"
]);

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    if (request.method !== "POST") return json({ version: VERSION, ok: true }, 200);

    let enquiry;
    try {
      enquiry = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const brief = await buildLeadBrief(enquiry, env);

    if (env.LEAD_WEBHOOK_URL) {
      await sendWebhook(env.LEAD_WEBHOOK_URL, brief);
    }

    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      await sendTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, brief);
    }

    if (env.RESEND_API_KEY) {
      await sendEmail(env.RESEND_API_KEY, brief, env.LEAD_TO_EMAIL || DEFAULT_LEAD_EMAIL);
    }

    return json({ ok: true, version: VERSION }, 200);
  }
};

async function buildLeadBrief(enquiry, env) {
  const email = clean(enquiry.Email);
  const emailDomain = email.includes("@") ? email.split("@").pop().toLowerCase() : "";
  const company = clean(enquiry.Company);
  const product = clean(enquiry.Product);
  const message = clean(enquiry.Message);
  const countryCode = clean(enquiry.CountryCode);
  const phone = clean(enquiry.Phone);
  const fullPhone = [countryCode, phone].filter(Boolean).join(" ");
  const inferredSite = inferCompanySite(emailDomain);
  const domainInfo = await checkDomain(inferredSite);
  const notes = buildPreparationNotes({ enquiry, emailDomain, company, product, message, domainInfo, fullPhone });
  const prepBand = buildPrepBand({ emailDomain, company, domainInfo, message });

  const deterministicBrief = {
    version: VERSION,
    createdAt: new Date().toISOString(),
    lead: {
      name: clean(enquiry.Name),
      email,
      emailDomain,
      company,
      product,
      quantity: clean(enquiry.Quantity),
      destination: clean(enquiry.Destination),
      countryCode,
      phone,
      fullPhone,
      message,
      submittedPage: clean(enquiry.Page),
      submittedAt: clean(enquiry.SubmittedAt)
    },
    research: {
      inferredCompanyWebsite: inferredSite,
      emailDomainType: FREE_EMAIL_DOMAINS.has(emailDomain) ? "personal/free email domain" : "company or private domain",
      websiteCheck: domainInfo,
      searchLinks: {
        companyWebsite: inferredSite || "",
        companySearch: searchUrl(`${company} energy trading commodities`),
        personSearch: searchUrl(`${clean(enquiry.Name)} ${company}`),
        linkedInPerson: searchUrl(`site:linkedin.com/in ${clean(enquiry.Name)} ${company}`),
        linkedInCompany: searchUrl(`site:linkedin.com/company ${company}`),
        registrySearch: searchUrl(`${company} company registry`),
        sanctionsContext: searchUrl(`${company} sanctions compliance`),
        phoneSearch: fullPhone ? searchUrl(`"${fullPhone}" scam fraud`) : ""
      }
    },
    salespersonPrep: {
      prepBand,
      summary: buildSummary(enquiry, emailDomain, domainInfo),
      notes,
      suggestedQuestions: buildQuestions(enquiry),
      replyAngle: buildReplyAngle(product)
    }
  };

  deterministicBrief.ai = await buildAiPrep(enquiry, deterministicBrief, env);
  return deterministicBrief;
}

function buildSummary(enquiry, emailDomain, domainInfo) {
  const parts = [
    `${clean(enquiry.Name) || "A contact"} submitted a Petrair RFQ`,
    clean(enquiry.Company) ? `for ${clean(enquiry.Company)}` : "without a company name",
    clean(enquiry.Product) ? `covering ${clean(enquiry.Product)}` : "without a product selected"
  ];
  const domainText = emailDomain
    ? `Email domain is ${emailDomain}; ${domainInfo.status}.`
    : "No email domain could be checked.";
  return `${parts.join(" ")}. ${domainText}`;
}

function buildPreparationNotes({ enquiry, emailDomain, company, product, message, domainInfo, fullPhone }) {
  const notes = [];

  if (FREE_EMAIL_DOMAINS.has(emailDomain)) {
    notes.push("Contact used a personal/free email domain. Keep the first response polite, but ask for corporate profile and official company-domain contact details before sharing sensitive commercial documents.");
  }
  if (!company) notes.push("Company name is missing. Ask for legal company name, registration country and role in the transaction.");
  if (!domainInfo.reachable && emailDomain && !FREE_EMAIL_DOMAINS.has(emailDomain)) {
    notes.push("The inferred company website was not reachable during the automatic check. Use the prepared search links before replying with detailed trade terms.");
  }
  if (fullPhone) {
    notes.push("Phone number supplied. Treat any phone reputation result as context only; verify through official company channels before using it for sensitive commercial steps.");
  }
  if (/mandate|allocation|urgent|procedure|working with refinery|seller mandate|buyer mandate/i.test(message)) {
    notes.push("Message contains language often seen in intermediary or mandate-led approaches. Prepare verification questions around authority, buyer/seller role and bankable transaction path.");
  }
  if (/jet|a-1|aviation/i.test(product + " " + message)) {
    notes.push("For Jet A-1, verify destination airport/terminal, specification basis, volume schedule, inspection expectations and settlement instrument.");
  }
  if (/crude/i.test(product + " " + message)) {
    notes.push("For crude oil, verify grade, origin constraints, lifting window, Incoterm, destination refinery/trader role and documentary chain.");
  }
  if (/ulsd|en590|diesel/i.test(product + " " + message)) {
    notes.push("For ULSD 10ppm, verify sulphur basis, destination, monthly schedule, inspection location and whether pricing is index-linked.");
  }
  if (/\blpg\b|propane|butane|liquefied petroleum/i.test(product + " " + message)) {
    notes.push("For LPG, verify propane/butane mix, storage basis, terminal, vessel/transport route, pressure/refrigeration requirements and documentary chain.");
  }

  notes.push("This brief is preparation only. It is not KYC, sanctions clearance or a decision on legitimacy.");
  return notes;
}

function buildPrepBand({ emailDomain, company, domainInfo, message }) {
  if (!company || FREE_EMAIL_DOMAINS.has(emailDomain)) return "needs-company-verification";
  if (!domainInfo.reachable) return "verify-company-domain";
  if (/mandate|allocation|urgent|procedure|working with refinery|seller mandate|buyer mandate/i.test(message)) {
    return "verify-authority";
  }
  return "ready-for-sales-review";
}

function buildQuestions(enquiry) {
  const questions = [
    "Please confirm the legal buyer/seller entity, registration country and your role in the transaction.",
    "Please confirm product specification, quantity, destination, delivery window and preferred Incoterm.",
    "Please confirm expected payment instrument, issuing bank route and inspection requirements."
  ];
  const email = clean(enquiry.Email);
  const emailDomain = email.includes("@") ? email.split("@").pop().toLowerCase() : "";
  if (FREE_EMAIL_DOMAINS.has(emailDomain)) {
    questions.unshift("Please reply from an official company email address or provide a corporate website and profile for verification.");
  }
  if (!clean(enquiry.Company)) questions.unshift("What is the full legal company name and website?");
  return questions;
}

function buildReplyAngle(product) {
  const item = product || "the requested product";
  return `Thank them for the enquiry about ${item}. Keep pricing clearly indicative pending KYC, availability, specification, destination, delivery window, Incoterm and bank/documentary review.`;
}

async function buildAiPrep(enquiry, brief, env) {
  const prompt = buildAiPrompt(enquiry, brief);

  if (env.ANTHROPIC_API_KEY) {
    return buildAnthropicPrep(prompt, env);
  }

  if (env.OPENROUTER_API_KEY) {
    return buildOpenRouterPrep(prompt, env);
  }

  return {
    enabled: false,
    note: "AI enrichment not enabled. Deterministic sales prep, verification prompts and research links are still included."
  };
}

function buildAiPrompt(enquiry, brief) {
  return [
    "You are preparing a private RFQ briefing for a Geneva physical energy trading desk.",
    "Do not reject the lead. Treat every enquiry as received. Provide preparation notes only.",
    "You must return one valid JSON object only, with no markdown and no prose outside JSON.",
    "Required keys: summary, language, englishTranslation, prepBand, companyCheckResult, companyResearch, personCheckResult, personResearch, associationAssessment, phoneCheckResult, complianceReviewNotes, suggestedReply, suggestedQuestions, sourceUrls.",
    "prepBand must be one of: ready-to-review, needs-clarification, verify-carefully.",
    "Research order to control cost: first check whether the company appears publicly verifiable using the company name, website/domain, registry or credible web presence.",
    "If the company is not found or looks unverified, set companyCheckResult to 'not found during search - manual review from email', set prepBand to verify-carefully, and do not spend effort on person, LinkedIn association or phone reputation beyond saying not checked because company was not verified.",
    "Only if the company appears publicly verifiable, check whether the named person appears associated with that company, prioritising LinkedIn/professional profiles if available.",
    "Only if the company appears publicly verifiable and a phone number is supplied, search whether the phone number appears in obvious scam/fraud reports. Do not claim a number is clean; say no obvious public warning found if applicable.",
    "companyCheckResult should be one short status sentence.",
    "companyResearch should summarize public evidence for the company, website, activity and location.",
    "personCheckResult should be one short status sentence.",
    "personResearch should summarize public evidence for the named person, especially LinkedIn or professional profiles.",
    "associationAssessment should say whether public evidence connects the person to the company, is inconclusive, or suggests mismatch. Never overstate certainty.",
    "phoneCheckResult should be one short status sentence covering not supplied, not checked, no obvious warning found, or public warning found.",
    "sourceUrls must be an array of the most relevant public URLs used. If web search is unavailable or no source is useful, return an empty array.",
    "Keep summary, companyResearch, personResearch, associationAssessment and suggestedReply each under 380 characters. Keep suggestedQuestions to 4 items or fewer. Keep complianceReviewNotes to 3 items or fewer.",
    "Never claim sanctions/KYC clearance. Say when human review is required.",
    "",
    "RFQ JSON:",
    JSON.stringify({ enquiry, deterministicBrief: brief }, null, 2)
  ].join("\n");
}

async function buildAnthropicPrep(prompt, env) {
  const model = env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const useWebSearch = String(env.ANTHROPIC_WEB_SEARCH || "").toLowerCase() === "true";
  const maxSearches = Math.max(1, Math.min(Number(env.ANTHROPIC_WEB_SEARCH_MAX || 3), 3));
  const body = {
    model,
    system: "You create private salesperson prep notes for commodity RFQs. Output JSON only.",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 2400
  };

  if (useWebSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }];
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      return { enabled: true, ok: false, provider: "anthropic", model, note: `Claude request failed with HTTP ${response.status}` };
    }

    const data = await response.json();
    const content = data.content?.map((part) => part.text || "").join("\n") || "";
    const parsed = parseAiJson(content);
    return {
      enabled: true,
      ok: true,
      provider: "anthropic",
      model,
      webSearch: useWebSearch,
      webSearchRequests: data.usage?.server_tool_use?.web_search_requests || 0,
      ...parsed,
      ...(parsed.parseFailed ? { rawPreview: content.slice(0, 500) } : {})
    };
  } catch (error) {
    return { enabled: true, ok: false, provider: "anthropic", model, note: `Claude prep failed: ${error.message}` };
  }
}

async function buildOpenRouterPrep(prompt, env) {
  const model = env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3-0324";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
        "http-referer": "https://petrair.org/",
        "x-title": "Petrair RFQ Lead Brief"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You create private salesperson prep notes for commodity RFQs. Output JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 900
      })
    });

    if (!response.ok) {
      return { enabled: true, ok: false, provider: "openrouter", model, note: `OpenRouter request failed with HTTP ${response.status}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    return {
      enabled: true,
      ok: true,
      provider: "openrouter",
      model,
      ...parseAiJson(content)
    };
  } catch (error) {
    return { enabled: true, ok: false, provider: "openrouter", model, note: `OpenRouter prep failed: ${error.message}` };
  }
}

function parseAiJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
  }
  return { parseFailed: true, summary: content.slice(0, 600), raw: content };
}

async function checkDomain(site) {
  if (!site) return { status: "no company website inferred", reachable: false };
  try {
    const response = await fetch(site, {
      method: "HEAD",
      redirect: "follow",
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    return {
      status: response.ok ? "inferred website responded" : `inferred website returned HTTP ${response.status}`,
      reachable: response.ok,
      finalUrl: response.url
    };
  } catch (error) {
    return { status: `website check failed: ${error.message}`, reachable: false };
  }
}

function inferCompanySite(emailDomain) {
  if (!emailDomain || FREE_EMAIL_DOMAINS.has(emailDomain)) return "";
  return `https://${emailDomain}/`;
}

async function sendWebhook(url, brief) {
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(brief)
  });
}

async function sendTelegram(botToken, chatId, brief) {
  const message = telegramText(brief);
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true
    })
  });
}

async function sendEmail(apiKey, brief, toEmail) {
  const subject = `Petrair RFQ lead brief - ${brief.lead.company || brief.lead.email || "new enquiry"}`;
  const body = briefToText(brief);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: "Petrair Lead Brief <onboarding@resend.dev>",
      to: [toEmail],
      subject,
      text: body
    })
  });
}

function briefToText(brief) {
  const lead = brief.lead;
  const research = brief.research;
  const prep = brief.salespersonPrep;
  return [
    "PETRAIR RFQ LEAD BRIEF",
    "",
    `Created: ${brief.createdAt}`,
    "",
    "Contact",
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.fullPhone}`,
    `Company: ${lead.company}`,
    `Product: ${lead.product}`,
    `Quantity: ${lead.quantity}`,
    `Destination: ${lead.destination}`,
    "",
    "Message",
    lead.message,
    "",
    "Research",
    `Email domain: ${lead.emailDomain}`,
    `Domain type: ${research.emailDomainType}`,
    `Inferred website: ${research.inferredCompanyWebsite}`,
    `Website check: ${research.websiteCheck.status}`,
    "",
    "Search Links",
    ...Object.entries(research.searchLinks).map(([key, value]) => `${key}: ${value}`),
    "",
    "Salesperson Prep",
    prep.summary,
    "",
    "Notes",
    ...prep.notes.map((note) => `- ${note}`),
    "",
    "Suggested Questions",
    ...prep.suggestedQuestions.map((question) => `- ${question}`),
    "",
    "Reply Angle",
    prep.replyAngle,
    "",
    "AI Prep",
    brief.ai?.enabled ? JSON.stringify(brief.ai, null, 2) : brief.ai?.note || "Not enabled"
  ].join("\n");
}

function telegramText(brief) {
  const lead = brief.lead;
  const ai = brief.ai || {};
  const summaryProducer = ai.ok
    ? `Summary produced by ${ai.provider === "anthropic" ? "Claude" : "AI"}${ai.webSearch ? " with web research" : ""}`
    : "Summary produced by manual prep";
  const aiSummary = ai.parseFailed
    ? brief.salespersonPrep.summary
    : ai.enabled && !ai.ok
    ? ai.note || "AI enrichment failed; manual prep used."
    : ai.summary || brief.salespersonPrep.summary || ai.note || "Manual sales prep generated.";
  const band = ai.prepBand || brief.salespersonPrep.prepBand || "manual-review";
  const notes = brief.salespersonPrep.notes.filter((note) => !/^This brief is preparation only/i.test(note)).slice(0, 3);
  const search = brief.research.searchLinks.companySearch;
  const lines = [
    "Petrair quotation received",
    "",
    `Prep: ${band}`,
    `Product: ${lead.product || "Not supplied"}`,
    `Company: ${lead.company || "Not supplied"}`,
    `Contact: ${lead.name || "Not supplied"} <${lead.email || "no email"}>`,
    lead.fullPhone ? `Phone: ${lead.fullPhone}` : "",
    `Quantity: ${lead.quantity || "Not supplied"}`,
    `Destination: ${lead.destination || "Not supplied"}`,
    "",
    summaryProducer,
    `Summary: ${aiSummary}`,
    "",
    `Email domain: ${brief.research.emailDomainType}`,
    "",
    ai.companyCheckResult ? `Company check: ${oneLine(ai.companyCheckResult)}` : `Company check: ${brief.research.inferredCompanyWebsite ? brief.research.websiteCheck.status : "no company website inferred"} - manual review from email`,
    ai.companyResearch ? `Company notes: ${oneLine(ai.companyResearch)}` : "",
    ai.personCheckResult ? `Person check: ${oneLine(ai.personCheckResult)}` : "",
    ai.personResearch ? `Person notes: ${oneLine(ai.personResearch)}` : "",
    ai.associationAssessment ? `Association check: ${oneLine(ai.associationAssessment)}` : "",
    ai.phoneCheckResult ? `Phone check: ${oneLine(ai.phoneCheckResult)}` : lead.fullPhone ? "Phone check: supplied, not independently verified." : "",
    ai.sourceUrls?.length ? `Sources: ${ai.sourceUrls.slice(0, 3).join(" | ")}` : "",
    !ai.companyCheckResult && search ? `Manual search: ${search}` : "",
    ai.parseFailed ? "AI format warning: Claude response was cut off or not valid JSON. Manual prep is shown; redeploy the latest Worker and retest." : "",
    ai.webSearch && !ai.companyCheckResult && !ai.companyResearch && !ai.personCheckResult && !ai.personResearch && !ai.associationAssessment && !ai.phoneCheckResult && !ai.parseFailed
      ? "Research: web search ran, but Claude did not return company/person evidence. Use the search link before reply."
      : "",
    ai.companyCheckResult || ai.companyResearch || ai.personCheckResult || ai.personResearch || ai.associationAssessment || ai.phoneCheckResult || ai.parseFailed || ai.webSearch ? "" : "",
    "Prep notes:",
    ...notes.map((note) => `- ${note}`),
    "",
    "Questions:",
    ...(ai.suggestedQuestions || brief.salespersonPrep.suggestedQuestions).slice(0, 4).map((question) => `- ${question}`),
    "",
    "Preparation only. Not KYC or sanctions clearance."
  ];
  return lines.filter((line, index, arr) => line || (arr[index - 1] && arr[index + 1])).join("\n").slice(0, 3900);
}

function oneLine(value) {
  return clean(Array.isArray(value) ? value.join("; ") : value).replace(/\s+/g, " ").slice(0, 550);
}

function searchUrl(query) {
  const value = clean(query);
  return value ? `https://www.google.com/search?q=${encodeURIComponent(value)}` : "";
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}
