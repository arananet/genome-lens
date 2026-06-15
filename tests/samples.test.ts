import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parseGenomeFile } from '../src/parse'

const SAMPLES_DIR = path.join(__dirname, '..', 'samples')

describe('synthetic samples parse correctly', () => {
  it('23andMe sample', async () => {
    const buf = fs.readFileSync(path.join(SAMPLES_DIR, 'synthetic-23andme.txt'))
    const file = new File([buf], 'synthetic-23andme.txt', { type: 'text/plain' })
    const genome = await parseGenomeFile(file)
    expect(genome.source).toBe('23andme')
    expect(genome.variantCount).toBeGreaterThan(2500)
    expect(genome.byRsid.has('rs4680')).toBe(true)
    expect(genome.byRsid.has('rs1061170')).toBe(true)
  })

  it('AncestryDNA sample', async () => {
    const buf = fs.readFileSync(path.join(SAMPLES_DIR, 'synthetic-ancestry.txt'))
    const file = new File([buf], 'synthetic-ancestry.txt', { type: 'text/plain' })
    const genome = await parseGenomeFile(file)
    expect(genome.source).toBe('ancestry')
    expect(genome.variantCount).toBeGreaterThan(1800)
    expect(genome.byRsid.has('rs429358')).toBe(true)
  })

  it('MyHeritage WGS sample', async () => {
    const buf = fs.readFileSync(path.join(SAMPLES_DIR, 'synthetic-myheritage.txt'))
    const file = new File([buf], 'synthetic-myheritage.txt', { type: 'text/plain' })
    const genome = await parseGenomeFile(file)
    expect(genome.source).toBe('myheritage')
    expect(genome.method).toBe('Low-pass Whole Genome Sequencing')
    expect(genome.variantCount).toBeGreaterThan(2200)
  })
})
