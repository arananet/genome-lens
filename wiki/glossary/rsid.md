---
term: rsID
title: rsID (Reference SNP cluster ID)
category: core
---
An **rsID** is a stable identifier for a variant, assigned by dbSNP, written like
`rs4680`. It lets different databases and test vendors refer to the same position
unambiguously.

genome-lens matches your file to its knowledge base by rsID. If an rsID in the
knowledge base is absent from your upload, it is shown as **not covered** — which
is *not* the same as a negative result.
