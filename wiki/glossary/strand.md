---
term: Strand
title: DNA strand & orientation
category: data-quality
---
DNA is double-stranded, and the two strands are complementary (A pairs with T,
C pairs with G). The same variant can therefore be reported as `A/G` on one
strand or `T/C` on the other.

To compare genotypes correctly, genome-lens stores every knowledge-base **effect
allele on the forward (+) GRCh37 strand** and documents that orientation. When a
vendor reports the opposite strand, the relevant caveat flags it. Getting strand
wrong is a classic source of false interpretations.
