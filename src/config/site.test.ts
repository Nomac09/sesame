import {
  absoluteUrl,
  LOCAL_SITE_URL,
  PRODUCTION_SITE_URL,
  siteUrl,
} from "@/config/site";
import { check, section, summary } from "@/lib/test-harness";

/** Isole les variables lues par siteUrl(), puis restaure l'environnement. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const keys = ["NEXT_PUBLIC_SITE_URL", "VERCEL_ENV", "VERCEL_URL"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const key of keys) delete process.env[key];
    for (const [key, value] of Object.entries(vars)) {
      if (value !== undefined) process.env[key] = value;
    }
    fn();
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

section("Resolution de l'URL de base");

check("sans rien, on est en local", () => {
  withEnv({}, () => {
    if (siteUrl() !== LOCAL_SITE_URL) throw new Error(siteUrl());
  });
});

check("en production Vercel, le domaine de production", () => {
  withEnv({ VERCEL_ENV: "production" }, () => {
    if (siteUrl() !== PRODUCTION_SITE_URL) throw new Error(siteUrl());
  });
});

check("en preview, le deploiement courant", () => {
  withEnv({ VERCEL_ENV: "preview", VERCEL_URL: "sesame-abc123.vercel.app" }, () => {
    if (siteUrl() !== "https://sesame-abc123.vercel.app") throw new Error(siteUrl());
  });
});

check("la surcharge explicite gagne sur la production", () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: "https://essai.example", VERCEL_ENV: "production" }, () => {
    if (siteUrl() !== "https://essai.example") throw new Error(siteUrl());
  });
});

check("la surcharge explicite gagne sur la preview", () => {
  withEnv(
    { NEXT_PUBLIC_SITE_URL: "http://localhost:4000", VERCEL_URL: "x.vercel.app" },
    () => {
      if (siteUrl() !== "http://localhost:4000") throw new Error(siteUrl());
    },
  );
});

check("une surcharge vide ou blanche est ignoree", () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: "   ", VERCEL_ENV: "production" }, () => {
    if (siteUrl() !== PRODUCTION_SITE_URL) throw new Error(siteUrl());
  });
});

check("le slash final est retire", () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: "https://essai.example///" }, () => {
    if (siteUrl() !== "https://essai.example") throw new Error(siteUrl());
  });
});

section("URL absolues");

check("un chemin avec slash initial", () => {
  withEnv({}, () => {
    if (absoluteUrl("/merci") !== "http://localhost:3000/merci") {
      throw new Error(absoluteUrl("/merci"));
    }
  });
});

check("un chemin sans slash initial", () => {
  withEnv({}, () => {
    if (absoluteUrl("merci") !== "http://localhost:3000/merci") {
      throw new Error(absoluteUrl("merci"));
    }
  });
});

check("pas de double slash quand la base en a un", () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: "https://essai.example/" }, () => {
    if (absoluteUrl("/merci") !== "https://essai.example/merci") {
      throw new Error(absoluteUrl("/merci"));
    }
  });
});

summary();
