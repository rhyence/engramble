import type { StudySet } from '../types';

export const CATEGORY_COLORS = [
  '#c84b2f',
  '#2d6a4f',
  '#1a4a8a',
  '#7b3fa0',
  '#d18f22',
  '#0f766e',
  '#b83280',
  '#475569',
  '#7c2d12',
  '#2563eb',
  '#15803d',
  '#9333ea',
];

export const sampleStudySets: StudySet[] = [
  {
    id: 'sample-cell-biology',
    ownerId: 'local-user',
    name: 'Cell Biology - Unit 2',
    createdAt: '2026-05-25',
    isPublic: false,
    categories: [
      {
        name: 'Cell Organelles',
        color: CATEGORY_COLORS[0],
        terms: [
          { term: 'Mitochondria', def: 'Double-membraned organelle that produces ATP via cellular respiration; the powerhouse of the cell' },
          { term: 'Ribosome', def: 'Small organelle that synthesises proteins by translating mRNA sequences' },
          { term: 'Golgi Body', def: 'Organelle that packages and dispatches proteins and lipids to their destinations' },
          { term: 'Lysosome', def: 'Membrane-bound organelle containing digestive enzymes that break down waste materials' },
        ],
      },
      {
        name: 'Cell Membrane',
        color: CATEGORY_COLORS[1],
        terms: [
          { term: 'Phospholipid', def: 'Molecule with a hydrophilic head and hydrophobic tail that forms the bilayer of cell membranes' },
          { term: 'Osmosis', def: 'Passive movement of water across a semi-permeable membrane from low to high solute concentration' },
          { term: 'Endocytosis', def: 'Process by which a cell engulfs external material by infolding of the plasma membrane' },
          { term: 'Receptor', def: 'Protein embedded in the membrane that binds to specific signalling molecules to trigger responses' },
        ],
      },
      {
        name: 'DNA & Replication',
        color: CATEGORY_COLORS[2],
        terms: [
          { term: 'Helicase', def: 'Enzyme that unwinds and separates the double helix by breaking hydrogen bonds between base pairs' },
          { term: 'Nucleotide', def: 'Monomer of DNA consisting of a sugar, phosphate group, and a nitrogenous base' },
          { term: 'Polymerase', def: 'Enzyme that synthesises new DNA strands by adding complementary nucleotides to a template' },
          { term: 'Telomere', def: 'Repetitive DNA sequence at chromosome ends that protects against degradation during replication' },
        ],
      },
      {
        name: 'Cell Division',
        color: CATEGORY_COLORS[3],
        terms: [
          { term: 'Mitosis', def: 'Type of cell division producing two genetically identical daughter cells for growth and repair' },
          { term: 'Cytokinesis', def: 'Physical division of the cytoplasm following nuclear division to produce two separate cells' },
          { term: 'Centromere', def: 'Region of a chromosome where the two sister chromatids are joined and where spindle fibres attach' },
          { term: 'Apoptosis', def: 'Programmed cell death triggered by internal or external signals to remove damaged or unneeded cells' },
        ],
      },
    ],
  },
  {
    id: 'sample-nervous-system',
    ownerId: 'local-user',
    name: 'Human Physiology - Nervous System',
    createdAt: '2026-05-25',
    isPublic: false,
    categories: [
      {
        name: 'Neuron Anatomy',
        color: CATEGORY_COLORS[0],
        terms: [
          { term: 'Axon', def: 'Long projection of a neuron that carries electrical impulses away from the cell body' },
          { term: 'Dendrite', def: 'Branched extension of a neuron that receives signals from other neurons' },
          { term: 'Myelin', def: 'Fatty insulating sheath around axons that speeds up electrical signal transmission' },
          { term: 'Synapse', def: 'Junction between two neurons where chemical or electrical signals are transmitted' },
        ],
      },
      {
        name: 'Neurotransmitters',
        color: CATEGORY_COLORS[1],
        terms: [
          { term: 'Dopamine', def: 'Neurotransmitter associated with reward, motivation, and motor control pathways' },
          { term: 'Serotonin', def: 'Neurotransmitter that regulates mood, appetite, sleep, and social behaviour' },
          { term: 'Acetylcholine', def: 'Neurotransmitter that activates muscle contractions and plays a role in memory' },
          { term: 'GABA', def: 'Primary inhibitory neurotransmitter that reduces neuronal excitability throughout the nervous system' },
        ],
      },
      {
        name: 'Brain Regions',
        color: CATEGORY_COLORS[2],
        terms: [
          { term: 'Hippocampus', def: 'Brain region critical for forming new long-term memories and spatial navigation' },
          { term: 'Amygdala', def: 'Almond-shaped structure involved in processing emotions especially fear and aggression' },
          { term: 'Cerebellum', def: 'Hindbrain region that coordinates balance, posture, and fine motor movements' },
          { term: 'Prefrontal Cortex', def: 'Front region of the frontal lobe responsible for planning, decision-making, and impulse control' },
        ],
      },
      {
        name: 'Signal Transmission',
        color: CATEGORY_COLORS[3],
        terms: [
          { term: 'Action Potential', def: 'Rapid electrical signal that travels along a neuron when the membrane depolarises past threshold' },
          { term: 'Refractory Period', def: 'Brief window after an action potential when a neuron cannot fire again' },
          { term: 'Depolarisation', def: 'Rapid influx of sodium ions that makes the inside of a neuron less negative' },
          { term: 'Saltatory Conduction', def: 'Jumping of action potentials between nodes of Ranvier along a myelinated axon' },
        ],
      },
    ],
  },
];
