---
term: Imputation
title: Imputation & low-pass sequencing
category: data-quality
---
Consumer arrays and **low-pass whole-genome sequencing** do not read every
position directly. Many genotypes are **imputed** — statistically inferred from
nearby measured variants and a reference panel.

Imputed or low-coverage calls can be wrong. genome-lens flags findings as
**low-confidence** when the file declares a low-pass method or returns a
[no-call](#no-call), and it never presents an inferred genotype as if it were
directly measured.
