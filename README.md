# Statement CSV normalizer — free n8n workflow

Loupe & Lettres — créé avec l'aide de l'IA

Turn pasted CSV text into transaction JSON with validated dates, integer amounts and separate currency totals. The workflow is inactive and runs manually. It does not contact a bank, send an email, write a spreadsheet or require credentials.

## Run the example

1. Import `normaliser-csv-gratuit.json` into a fresh n8n workflow.
2. Open the `Example statement` Code node. Its returned item contains `profile` and `csv`; keep the synthetic Qonto-inspired example for the first run.
3. Execute the workflow manually. Inspect the JSON output of `Normalize statement`.
4. Compare `transactions` and `summary` with `expected/qonto.json`. There are three operations, one possible duplicate and an EUR total of 115020 cents. Both identical expense rows remain included in that total.
5. To try another layout, replace `profile` and the complete CSV string in `Example statement`. Preserve the JavaScript string escaping; use JSON.stringify in your editor if needed. Available profile names are `qonto`, `boursorama`, `revolut_business` and `credit_agricole`. This repository ships the fixture and expected output for `qonto` only; the other three mappings are in the code but their fixtures are not published here.

The name of a bank identifies the demonstration layout only. All included records and headers are synthetic examples; actual bank exports have not been verified. Banks can change their export layouts. Compare your file's headers, delimiter, dates, signs and decimal punctuation with the fixture before adapting the mapping.

## Inputs and output

`profile` selects the demonstration mapping; `csv` is CSV text, not a filename or a remote URL. Each row must have all required columns and match the header width. Extra named columns are ignored. Header names are case-sensitive after trimming surrounding spaces.

| Profile | Delimiter | Date format | Required headers | Amount format |
| --- | --- | --- | --- | --- |
| qonto | comma | YYYY-MM-DD | Date, Label, Amount, Currency | -24.90 or 1,234.56 in a quoted field |
| boursorama | semicolon | DD/MM/YYYY | Date opération, Libellé, Montant, Devise | -24,90 or 1 234,56 |
| revolut_business | comma | YYYY-MM-DD | Date, Description, Amount, Currency | -24.90 or 1,234.56 in a quoted field |
| credit_agricole | semicolon | DD/MM/YYYY | Date, Libellé, Débit, Crédit, Devise | Nonnegative debit/credit magnitudes, decimal comma |

For debit/credit input, an empty side means zero. Both sides empty, negative magnitudes or two nonzero sides stop the run. Two explicit zeros are accepted.

Each transaction has `row` (logical data record number including the header), `date` (ISO), `label`, `amountCents`, `currency` and `duplicateOf`. A positive amount is incoming; a negative amount is outgoing. Amounts use the two minor units of EUR, USD, GBP or CHF only; unsupported currencies stop the run. Values have at most two decimals. Each currency has a separate total.

`duplicateOf` points to the first matching logical record, or is null. It is a review hint, not proof of a duplicate: the key uses date, trimmed label, amount and currency. Identical operations are never removed. An incomplete or invalid row stops the complete run with a row error; no partial result is returned.

The parser accepts a UTF-8 BOM, CRLF/LF line endings, quoted fields, doubled quotes and multiline fields. Empty lines are ignored. Dates are restricted to valid calendar dates from 1900 through 2199. Limits are one million CSV characters and 10000 data records. Run oversized files in reviewed batches; duplicate hints apply only within one supplied statement.

## Tests and current evidence

Targeted JavaScript checks: `node --test tests/normalize.test.cjs` from the repository root. The fixture and expected output for `qonto` are included. The expected values were written separately and checked for dates, signs, totals, currency separation and duplicate hints.

The JSON also contains the normalization source directly, so users do not need local files or packages. `src/normalize.cjs` is the readable source; the source-sync test detects divergence from the embedded code.

n8n import and execution are not claimed here until the parent project's runtime report records an actual run of this exact JSON. Node checks alone do not establish that. Gmail and Google Sheets integrations are not included or tested. No scheduled trigger or production configuration is installed by this template.

## Scope and license

This free workflow, its source, examples and documentation are licensed under the accompanying MIT license. This license is independent of the paid pack and does not grant rights to files that are absent from this free folder.

This is a data preparation tool. Review output before using it for reconciliation, accounts or tax reporting. The product is independent of n8n and the banks named in the demonstration profiles; no endorsement is claimed.

## More from Loupe & Lettres

This repository is published by Loupe & Lettres, an AI-assisted shop (no named person; created with AI assistance). Want the next step? The **Freelance admin pack for n8n (French, 19 USD)** adds five editable workflows: bank statement to categorized entries, unpaid-invoice reminders, monthly summary, invoice-to-payment matching and a revenue-threshold tracker. All use fictional sample data and are modifiable in your own n8n instance: https://loupe-lettres-lien-pack-n8n.atelier-4efd18.workers.dev/pack/github (short link, counted anonymously; redirects to https://loupeetlettres.gumroad.com/l/ynqrgw). Shop: https://loupeetlettres.gumroad.com/

Different topic, same shop: two small kits for people who use Claude Code hooks, **Hook Proof** (a hook tester, 9 USD): https://loupeetlettres.gumroad.com/l/gvdarr and **Hook Cookbook** (five non-blocking hooks, 8 USD): https://loupeetlettres.gumroad.com/l/dpehuq. They have nothing to do with n8n or CSV.
