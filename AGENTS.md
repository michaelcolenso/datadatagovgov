Role & Context:
You are an elite Full-Stack Data Engineer and Technical SEO Architect. We are building a high-traffic Programmatic SEO (pSEO) web application in the automotive niche. The goal is to ingest raw vehicle recall and safety data from the NHTSA APIs, enrich it using an LLM to make it human-readable, store it in a relational database, and serve it via a lightning-fast, highly indexed frontend.
The Tech Stack:
	∙	Frontend & API: Next.js (App Router, using Incremental Static Regeneration - ISR)
	∙	Database: PostgreSQL (hosted on Supabase or Vercel Postgres)
	∙	ORM: Prisma or Drizzle
	∙	Enrichment: OpenAI API (GPT-4o-mini) or Anthropic API (Claude 3.5 Haiku) for cost-effective, high-volume text translation.
	∙	Styling: Tailwind CSS + shadcn/ui
I need you to build this soup to nuts. We will work in phases. Please read this entire architecture document, acknowledge it, and then write the code for Phase 1 & 2 to start.
Phase 1: The Database Schema (The Skeleton)
We need a relational structure to store the hierarchical nature of cars and their issues. Design the Prisma/Drizzle schema with the following tables:
	∙	Make: id, name, slug (e.g., Ford, ford)
	∙	Model: id, makeId, name, slug (e.g., F-150, f-150)
	∙	VehicleYear: id, modelId, year (e.g., 2018)
	∙	Recall: id, vehicleYearId, nhtsaCampaignNumber, component, summaryRaw, consequenceRaw, remedyRaw, summaryEnriched, consequenceEnriched, remedyEnriched (These ‘Enriched’ columns are crucial—they will hold the LLM-translated text).
Phase 2: The Data Ingestion Engine (The Guts)
Write a Node.js/TypeScript background script (or Next.js API route) that does the following:
	∙	Hits the NHTSA vPIC API to get all Makes.
	∙	Hits the NHTSA vPIC API to get all Models for a specific Make.
	∙	Hits the NHTSA Recalls API (https://api.nhtsa.gov/recalls/recallsByVehicle?make={make}&model={model}&modelYear={year}) to fetch raw recall data.
	∙	Crucial: Implement a rate-limiter or delay mechanism so we don’t get blocked by the NHTSA servers.
Phase 3: The LLM Enrichment Pipeline (The Brains)
Write a utility function that takes the raw summaryRaw, consequenceRaw, and remedyRaw from Phase 2, and passes it to the LLM API.
	∙	The System Prompt for the LLM: “You are an expert, empathetic automotive mechanic. Translate this bureaucratic government vehicle recall notice into simple, urgent, but non-panic-inducing language for an average car owner. Explain what the part is, what happens if it breaks (consequence), and exactly what the dealership will do to fix it (remedy). Keep it to 3 short paragraphs. Output strictly in valid JSON format with keys: summary, consequence, remedy.”
	∙	Update the database with the enriched JSON data.
Phase 4: The Next.js Frontend & Routing (The Skin & Feathers)
Build the Next.js dynamic routes utilizing ISR (so pages load instantly for Googlebot but refresh periodically).
	∙	Directory Structure: /app/[make]/[model]/[year]/page.tsx
	∙	UI Components: >     * A clean, trust-inspiring header.
	∙	A “Severity Score” badge (e.g., Red for Engine/Brakes, Yellow for Wipers/Accessories).
	∙	The LLM-enriched summary of the recall.
	∙	A distinct “Monetization Block”: A placeholder component titled LocalDealerLeadGen that says “Find a certified [Make] dealer near you to fix this for free.”
Phase 5: Technical SEO (The Megaphone)
	∙	Write the generateMetadata function for the dynamic route to output highly optimized Title Tags: “[Year] [Make] [Model] Recalls: [Component] Issues Explained”.
	∙	Generate programmatic JSON-LD Schema Markup (FAQ Schema or Article Schema) for the recall data so we win Google Rich Snippets.
	∙	Create an automated sitemap.xml generator that pulls all combinations of Make/Model/Year from the database.
Your First Task:
Do not write the whole app at once. Start by giving me the Prisma/Drizzle schema (Phase 1) and the Data Ingestion Script (Phase 2). Make sure the ingestion script has robust error handling for API timeouts.
