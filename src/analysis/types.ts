import type { KbEntry } from "../kb/types";
import type { Variant } from "../parse/types";

export interface Finding {
  entry: KbEntry;
  variant: Variant | null; // null when the rsid is absent from the upload
  genotype: string | null; // canonicalized genotype, or null if not covered
  copies: number | null; // copies of the forward-strand effect allele (0..2)
  interpretation: string; // plain-language note for this genotype
  covered: boolean; // is the rsid present in the uploaded genome?
  noCall: boolean; // genotype present but a no-call ("--")
  lowConfidence: boolean; // low-pass method or no-call
  indeterminate: boolean; // result cannot be determined (e.g. APOE missing rs429358)
}
