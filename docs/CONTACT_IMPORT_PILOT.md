# Same email, different people?

Decision, 21 November 2026: test a browser-local conflict review at
`/community/import-check`. This is a web experiment, not an Anna resubmission
or evidence of willingness to pay. Do not build a general list cleaner yet.

Status, 21 November 2026: the demo is implemented in `src/app/community/import-check/page.tsx`
with grouping/parsing in `src/lib/import-conflicts.ts`, committed in `8dc52b1`,
but not deployed publicly. Local verification: 16 unit tests
(`tests/import-conflicts.unit.ts`), 4 Playwright tests (`tests/import-check.spec.ts`),
`npm run check:surfaces` and `npx tsc --noEmit` passed. No participants or
outcomes recorded yet; treat the page as the pilot demo, not demand evidence.

## Evidence for and against

- A [membership organiser importing siblings](https://community.hubspot.com/t/importing-data-and-i-want-to-keep-duplicates/90788)
  and a [user importing business contacts](https://community.hubspot.com/t/importing-company-with-multiple-contacts/110305)
  needed to preserve different people sharing one address. A [feature request](https://community.hubspot.com/t/flag-duplicate-emails-on-import-do-not-silent-delete/153571)
  distinguishes conflicts within the file from matches in the destination.
  These are reports of a problem, not a market-size estimate.
- [Mailchimp](https://mailchimp.com/help/troubleshooting-contact-imports/)
  already checks syntax/duplicates; [AttendeeBuzz](https://attendeebuzz.com/help/import-attendees)
  offers mapping and rejected-row downloads. Duplicating those features is
  not a compelling standalone product. [HubSpot's matching rules](https://knowledge.hubspot.com/records/deduplication-of-records)
  depend on identifiers and import settings. A single CSV cannot reveal CRM state.

### TikTok snapshot, not search volume

Monid `anyapi /tiktok.search_keyword`, relevance, 180 days, one page each for
`remove duplicates Excel`, `HubSpot duplicate contacts`, `HubSpot import errors`
and `Mailchimp import errors`. Four calls, $0.0048 total. 120 results, 116
distinct video IDs. Captions reviewed, not comments or viewer intent.

| Video | Views / saves at collection | Interpretation |
| --- | --- | --- |
| [Excel one-click removal](https://www.tiktok.com/@digitalwork04/video/7658720154062327063) | 57,224 / 1,071 | Strong tutorial hook; Excel already does it. |
| [Review before deleting](https://www.tiktok.com/@thedatashortcuts/video/7709356346591792397) | 153 / 0 | Closer to the problem; weak content signal. |
| [Sheets to HubSpot](https://www.tiktok.com/@avaacademiadigital/video/7700384309491846418) | 10,762 / 556 | Import training, not a tool request; appeared in both HubSpot searches. |
| [AI import preparation](https://www.tiktok.com/@processproconsulting/video/7707701916880407822) | 88 / 0 | Provider describing a workflow, not a buyer requesting one. |

None of the 30 Mailchimp captions clearly described a failed Mailchimp contact
import. Poor retrieval does not mean zero demand.

## How to run the pilot

Recruit five people who regularly import contacts (CRM consultants, membership
ops, event administrators). No participants or outcomes recorded yet. Suggested
invitation: "Do you bring contacts from spreadsheets into a CRM? Could you try
a five-minute check on your next import? You keep the file on your device.
We're looking for cases where the same email should not mean the same person."

1. Ask about their last import and the destination's identifier before the demo.
2. Show the sample without explanation: “Which records would you review before
   importing, and why?” Then let them choose their own file and email column.
3. Ask what, if anything, they would do differently from the native importer.
   Record only participant alias, destination, changed decision (yes/no and
   non-identifying reason), and whether they actually returned with another file.
   Never collect names, addresses, CSVs or screenshots of participant data.
4. Advance only if **at least two of five** find a conflict in their own file
   that changes their import decision **and at least one** returns with a
   second file. If only the tutorial gets interest, treat it as content. If
   native tools suffice, stop. These are pilot criteria, not measured results.

Separate discovery track: ask organisers for a redacted prior sponsor recap and
the question it answered. [Luma](https://help.luma.com/p/download-guest-csv)
can export filtered guests or ticket rows; neither proves unique people or
workshop attendance. Some organisers [sell sponsor reporting](https://www.hackatdavidson.com/sponsor);
others [promise placements and photos](https://www.atxcreatormeetups.com/sponsorship).
Test whether a claim actually changes before building a reporting product.
