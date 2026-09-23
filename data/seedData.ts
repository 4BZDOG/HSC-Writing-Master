import { Course } from '../types';
import { NESA_PERFORMANCE_BAND_DESCRIPTORS } from './performanceBands';

// Pre-generated, teacher-reviewed data for immediate use
export const preseededCourses: Course[] = [
  {
    id: 'course-bio-advanced',
    name: 'HSC Biology (Advanced)',
    outcomes: [
      {
        code: 'BIO11-1',
        description: 'develops and evaluates questions and hypotheses for scientific investigation',
      },
      {
        code: 'BIO11-2',
        description:
          'designs and evaluates investigations in order to obtain primary and secondary data and information',
      },
      {
        code: 'BIO11-3',
        description:
          'conducts investigations to collect valid and reliable primary and secondary data and information',
      },
      {
        code: 'BIO11-4',
        description:
          'selects and processes appropriate qualitative and quantitative data and information using a range of appropriate media',
      },
      {
        code: 'BIO11-5',
        description: 'analyses and evaluates primary and secondary data and information',
      },
      {
        code: 'BIO11-6',
        description:
          'solves scientific problems using primary and secondary data, critical thinking skills and scientific processes',
      },
      {
        code: 'BIO11-7',
        description:
          'communicates scientific understanding using suitable language and terminology for a specific audience or purpose',
      },
      { code: 'BIO11-8', description: 'describes single cells as the basis for all life' },
      {
        code: 'BIO11-9',
        description: 'explains the structure and function of cells and cell parts',
      },
      { code: 'BIO11-10', description: 'describes the structure and function of enzymes' },
      {
        code: 'BIO12-12',
        description:
          'explains the structures of DNA and analyses the mechanisms of inheritance and how processes of reproduction ensure continuity of species',
      },
      {
        code: 'BIO12-13',
        description:
          'explains natural genetic change and the use of genetic technologies to induce genetic change',
      },
    ],
    topics: [
      {
        id: 'topic-heredity',
        name: 'Heredity and Genetic Change',
        performanceBandDescriptors: NESA_PERFORMANCE_BAND_DESCRIPTORS,
        subTopics: [
          {
            id: 'subtopic-dna-structure',
            name: 'DNA and Polypeptide Synthesis',
            dotPoints: [
              {
                id: 'dp-dna-replication',
                description: 'Construct models of the processes of DNA replication.',
                prompts: [
                  {
                    id: 'prompt-dna-replication-7',
                    question:
                      'Explain how DNA replication ensures genetic continuity from one generation to the next.',
                    totalMarks: 7,
                    verb: 'EXPLAIN',
                    scenario:
                      'A biology student is preparing a presentation on cell division and needs to explain why DNA replication is crucial for inheritance. They must articulate the mechanisms that ensure accuracy.',
                    linkedOutcomes: ['BIO12-12'],
                    relatedTopics: ['DNA structure', 'Semi-conservative replication', 'Cell cycle'],
                    prerequisiteKnowledge: ['DNA double helix structure', 'Nucleotide composition'],
                    markerNotes: [
                      'Look for key terms: semi-conservative, complementary base pairing, DNA polymerase, accuracy/proofreading',
                      'Award marks for describing both the process and its significance',
                      'Mentioning leading/lagging strands shows deeper understanding',
                    ],
                    commonStudentErrors: [
                      'Confusing transcription with replication',
                      'Omitting the role of enzymes',
                      "Not explaining WHY it's called semi-conservative",
                    ],
                    keywords: [
                      'semi-conservative',
                      'DNA polymerase',
                      'helicase',
                      'complementary base pairing',
                      'nucleotides',
                      'genetic continuity',
                      'proofreading',
                    ],
                    markingCriteria: `7 marks: Explains how semi-conservative replication, complementary base pairing and proofreading produce identical copies of DNA, and links each to continuity of genetic information between generations, using precise terminology
5-6 marks: Explains the semi-conservative mechanism and the roles of helicase and DNA polymerase, with a clear link to accurate copying
3-4 marks: Describes the steps of replication (unwinding, base pairing, synthesis) with some link to continuity
1-2 marks: Identifies a feature of replication or a key enzyme`,
                    // A sample's `band` is a cache of the Verb Gate —
                    // `getBandForMark(mark, totalMarks, verb tier)` — not a
                    // number to choose. Four of these six were written `band: 6`
                    // on the pre-Verb-Gate assumption that full marks means Band
                    // 6, which is wrong for every verb below Tier 6: a 4/4
                    // DESCRIBE caps at Band 2. Nothing rendered the stored value,
                    // so it sat wrong until the revise dialog — the last reader
                    // that trusted it — opened purple over an orange row.
                    // `tests/unit/seedSampleBands.test.ts` now holds them to the
                    // formula; recompute rather than guess when editing a mark.
                    sampleAnswers: [
                      {
                        id: 'sa-seed-1',
                        band: 3,
                        answer:
                          "DNA replication ensures genetic continuity because it produces two DNA molecules that carry the same base sequence as the original, so each daughter cell inherits identical genetic information. Replication is **semi-conservative**: **helicase** unwinds the double helix by breaking the hydrogen bonds between complementary bases, and each separated strand then acts as a template. **DNA polymerase** adds free nucleotides to each template in the 5' to 3' direction following **complementary base pairing** — adenine with thymine and cytosine with guanine — so the sequence of each new strand is dictated by the old one. Because DNA polymerase builds in only one direction, the leading strand is synthesised continuously while the lagging strand is made as Okazaki fragments, which **DNA ligase** joins into a continuous strand. Accuracy is maintained by **proofreading**: DNA polymerase detects and replaces mismatched bases, reducing errors to roughly one in a billion bases. As a result, each new molecule contains one original and one new strand with an almost identical sequence. When the cell divides by mitosis or meiosis, every daughter cell therefore receives a faithful copy of the genetic code, preserving characteristics from one generation to the next.",
                        mark: 7,
                        // Fixed: Added missing source property
                        source: 'AI',
                      },
                      {
                        id: 'sa-seed-2',
                        band: 1,
                        answer: 'DNA replication is when cells copy their DNA before dividing.',
                        mark: 0,
                        // Fixed: Added missing source property
                        source: 'AI',
                      },
                    ],
                  },
                  {
                    id: 'prompt-dna-replication-4',
                    question: 'Describe the key steps involved in DNA replication.',
                    totalMarks: 4,
                    verb: 'DESCRIBE',
                    // The question every new account opens first. It was the
                    // one shipped question with no marking guide, so the marker
                    // had only the verb to go on.
                    markingCriteria: `4 marks: Describes the key steps of DNA replication in sequence — unwinding by helicase, complementary base pairing, and synthesis of new strands by DNA polymerase — using accurate terminology
3 marks: Describes most of the key steps in sequence, with some accurate terminology
2 marks: Outlines some steps of replication, or names the key enzymes with limited description
1 mark: Identifies a relevant feature of DNA replication`,
                    keywords: [
                      'unwinding',
                      'helicase',
                      'DNA polymerase',
                      'complementary base pairing',
                      'nucleotides',
                    ],
                    sampleAnswers: [
                      {
                        id: 'sa-seed-3',
                        band: 2,
                        answer:
                          'DNA replication is semi-conservative and occurs in three key steps. First, the double helix **unwinds** as the enzyme **helicase** breaks the hydrogen bonds between complementary bases, exposing two template strands. Second, **DNA polymerase** moves along each template, adding free **nucleotides** by **complementary base pairing** — adenine with thymine and cytosine with guanine. Third, the new nucleotides are joined into a continuous sugar-phosphate backbone, producing two identical DNA molecules. Each molecule contains one original strand and one newly synthesised strand.',
                        mark: 4,
                        // Fixed: Added missing source property
                        source: 'AI',
                      },
                    ],
                  },
                ],
              },
              {
                id: 'dp-protein-synthesis',
                description: 'Model the process of protein synthesis.',
                prompts: [
                  {
                    id: 'prompt-protein-synthesis-8',
                    question:
                      'Analyse the relationship between DNA, mRNA, and protein synthesis in expressing genetic information.',
                    totalMarks: 8,
                    verb: 'ANALYSE',
                    scenario:
                      'A geneticist is investigating how a mutation in the CFTR gene leads to cystic fibrosis. They need to trace the flow of genetic information from DNA to functional protein to understand the disease mechanism.',
                    linkedOutcomes: ['BIO12-12', 'BIO12-13'],
                    relatedTopics: [
                      'Central dogma',
                      'Transcription',
                      'Translation',
                      'Gene expression',
                    ],
                    prerequisiteKnowledge: ['DNA structure', 'RNA types', 'Ribosome function'],
                    markerNotes: [
                      'Must address all three components: DNA, mRNA, and protein synthesis',
                      'Look for understanding of transcription and translation',
                      'Award higher marks for linking structure to function',
                    ],
                    commonStudentErrors: [
                      'Confusing transcription and translation',
                      'Forgetting that mRNA is the intermediate',
                      'Not explaining how the process results in a functional protein',
                    ],
                    keywords: [
                      'transcription',
                      'translation',
                      'mRNA',
                      'ribosome',
                      'codon',
                      'amino acid',
                      'central dogma',
                      'gene expression',
                    ],
                    markingCriteria: `8 marks: Analyses how the base sequence of DNA determines mRNA through transcription and the amino acid sequence through translation, explaining the role of codons, tRNA and ribosomes and how the relationship expresses genetic information
6-7 marks: Explains the relationships between DNA, mRNA and protein through transcription and translation, with some detail of the mechanism
4-5 marks: Describes transcription and translation, with some reference to how they relate
2-3 marks: Outlines the roles of DNA, mRNA or proteins
1 mark: Provides a relevant fact about protein synthesis`,
                    sampleAnswers: [
                      {
                        id: 'sa-seed-4',
                        band: 4,
                        answer:
                          "DNA, mRNA and proteins are linked in a directional relationship — the **central dogma** — in which the base sequence of DNA determines the amino acid sequence of a protein, and so its function. The information is stored in **DNA** as a sequence of nucleotide bases within a gene. During **transcription** in the nucleus, RNA polymerase unwinds the gene and assembles a complementary **mRNA** strand from the template strand, with uracil replacing thymine. In eukaryotes the pre-mRNA is processed: introns are removed and exons spliced together, so one gene can give rise to more than one protein. The mature mRNA carries the code to the cytoplasm, protecting the DNA in the nucleus while allowing the message to be read many times. During **translation**, a **ribosome** reads the mRNA three bases at a time. Each **codon** is matched by the anticodon of a tRNA molecule carrying a specific **amino acid**, and peptide bonds join the amino acids into a polypeptide that folds into a functional **protein**. The relationship therefore has two steps with different roles: transcription selects and copies the information, and translation converts it from the language of nucleotides into the language of amino acids. Because the code is read in triplets, a change to a single DNA base can alter one codon and so one amino acid, which is why a mutation in DNA can change a protein's shape and function. In this way the three molecules connect genotype to phenotype.",
                        mark: 8,
                        // Fixed: Added missing source property
                        source: 'AI',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'topic-genetic-tech',
        name: 'Genetic Technologies',
        performanceBandDescriptors: NESA_PERFORMANCE_BAND_DESCRIPTORS,
        subTopics: [
          {
            id: 'subtopic-gene-tech',
            name: 'Biotechnological Applications',
            dotPoints: [
              {
                id: 'dp-pcr',
                description:
                  'Evaluate the uses and applications of polymerase chain reaction (PCR) in biotechnology.',
                prompts: [
                  {
                    id: 'prompt-pcr-evaluation-10',
                    question:
                      'Evaluate the significance of PCR as a tool in modern biotechnology, considering both its applications and limitations.',
                    totalMarks: 10,
                    verb: 'EVALUATE',
                    scenario:
                      "A biotechnology company is deciding whether to invest in PCR equipment for their diagnostics lab. As a consultant, you must provide a balanced evaluation of this technology's value.",
                    linkedOutcomes: ['BIO12-13'],
                    relatedTopics: [
                      'DNA amplification',
                      'Forensics',
                      'Medical diagnostics',
                      'Genetic research',
                    ],
                    prerequisiteKnowledge: [
                      'DNA structure',
                      'Enzyme function',
                      'Thermostable DNA polymerase',
                    ],
                    markerNotes: [
                      'Must evaluate both applications AND limitations',
                      'Look for specific examples across multiple fields',
                      'High marks require balanced, critical judgement',
                    ],
                    commonStudentErrors: [
                      'Only listing applications without evaluation',
                      'Forgetting to mention limitations',
                      'Not providing specific examples',
                    ],
                    keywords: [
                      'amplification',
                      'DNA polymerase',
                      'thermocycler',
                      'diagnostics',
                      'forensics',
                      'genetic screening',
                      'quantitative PCR',
                      'limitations',
                      'contamination',
                    ],
                    markingCriteria: `10 marks: Makes a supported judgement about the significance of PCR, weighing specific applications against its limitations (contamination, primer design, error rate, need for a known sequence) with relevant examples
8-9 marks: Makes a judgement about the significance of PCR, supported by applications and limitations
6-7 marks: Explains applications and limitations of PCR, with an implied judgement
4-5 marks: Describes how PCR works and some of its uses
2-3 marks: Outlines PCR or one of its applications
1 mark: Provides a relevant fact about PCR`,
                    sampleAnswers: [
                      {
                        id: 'sa-seed-5',
                        band: 6,
                        answer:
                          "PCR is one of the most **significant** tools in modern biotechnology because it makes any known DNA sequence available in useful quantities within hours, although its limitations mean its results must be interpreted with care. In PCR, a sample is cycled through **denaturation** (about 95 °C), annealing of primers (about 55 °C) and extension by heat-stable Taq polymerase (about 72 °C), doubling the target sequence each cycle, so 30 cycles can produce over a billion copies.\n\nIts applications are wide and important. In **forensics**, PCR allows DNA profiles to be produced from trace samples such as a single hair root, which has solved cold cases and exonerated the wrongly convicted. In **medicine**, it detects pathogens and genetic disorders early: RT-PCR was the standard diagnostic test for COVID-19, and screening for mutations such as those causing cystic fibrosis relies on it. **Quantitative PCR** measures gene expression, supporting cancer research, and PCR underpins DNA sequencing, genetic engineering and conservation studies of endangered species.\n\nHowever, PCR has significant limitations. It is extremely sensitive to **contamination** — a single stray DNA molecule can be amplified into a false positive — so strict laboratory controls are needed. Primers can only be designed when part of the target sequence is already known, so PCR cannot find unknown genes. Taq polymerase lacks proofreading, so an early error is copied into every later cycle, and degraded samples may fail to amplify. PCR also shows that a sequence is present, not whether it is active or what it does, and **thermocycler** equipment and reagents add cost.\n\nOn balance, PCR's significance is very high. Its limitations are largely technical and are managed through controls, careful primer design and proofreading polymerases, whereas no other technique matches its speed and sensitivity. Its value is greatest when its results are confirmed with other molecular techniques, which is why it remains central to biotechnology rather than a complete answer on its own.",
                        mark: 10,
                        // Fixed: Added missing source property
                        source: 'AI',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'course-chemistry-advanced',
    name: 'HSC Chemistry (Advanced)',
    outcomes: [
      {
        code: 'CH11-1',
        description: 'develops and evaluates questions and hypotheses for scientific investigation',
      },
      {
        code: 'CH11-2',
        description:
          'designs and evaluates investigations in order to obtain primary and secondary data and information',
      },
      {
        code: 'CH11-3',
        description:
          'conducts investigations to collect valid and reliable primary and secondary data and information',
      },
      {
        code: 'CH11-4',
        description:
          'selects and processes appropriate qualitative and quantitative data and information using a range of appropriate media',
      },
      {
        code: 'CH11-5',
        description: 'analyses and evaluates primary and secondary data and information',
      },
      {
        code: 'CH11-6',
        description:
          'solves scientific problems using primary and secondary data, critical thinking skills and scientific processes',
      },
      {
        code: 'CH11-7',
        description:
          'communicates scientific understanding using suitable language and terminology for a specific audience or purpose',
      },
      { code: 'CH11-8', description: 'describes the atomic structure and properties of elements' },
      {
        code: 'CH11-9',
        description: 'describes the composition and reactions of carbon compounds',
      },
      { code: 'CH12-12', description: 'explains the characteristics of equilibrium systems' },
      {
        code: 'CH12-13',
        description:
          'explains and quantitatively analyses acids and bases using contemporary models',
      },
      {
        code: 'CH12-14',
        description: 'explains and quantifies enthalpy changes in chemical reactions',
      },
    ],
    topics: [
      {
        id: 'topic-acids-bases',
        name: 'Acid/Base Reactions',
        performanceBandDescriptors: NESA_PERFORMANCE_BAND_DESCRIPTORS,
        subTopics: [
          {
            id: 'subtopic-bronsted-lowry',
            name: 'Brønsted-Lowry Theory',
            dotPoints: [
              {
                id: 'dp-conjugate-pairs',
                description:
                  'Investigate the use of the Brønsted-Lowry theory to describe acid/base conjugate pairs.',
                prompts: [
                  {
                    id: 'prompt-conjugate-pairs-5',
                    question:
                      'Explain how the Brønsted-Lowry theory defines conjugate acid-base pairs using a specific chemical example.',
                    totalMarks: 5,
                    verb: 'EXPLAIN',
                    scenario:
                      'A chemistry student is preparing a practical report on acid-base titrations and needs to explain the concept of conjugate pairs to demonstrate their understanding of the underlying theory.',
                    linkedOutcomes: ['CH12-13'],
                    relatedTopics: ['Acid-base equilibrium', 'pH', 'Equilibrium constants'],
                    prerequisiteKnowledge: [
                      'Brønsted-Lowry acid/base definition',
                      'Chemical equilibrium basics',
                    ],
                    markerNotes: [
                      'Must include a specific chemical example (e.g., NH₃/NH₄⁺ or H₂O/H₃O⁺)',
                      'Look for clear explanation of proton transfer',
                      'Award marks for correct identification of both species in the pair',
                    ],
                    commonStudentErrors: [
                      'Forgetting that the conjugate differs by one H⁺',
                      "Choosing an example that doesn't form a clear conjugate pair",
                      'Confusing conjugate pairs with amphiprotic substances',
                    ],
                    keywords: [
                      'Brønsted-Lowry',
                      'conjugate acid',
                      'conjugate base',
                      'proton transfer',
                      'donor',
                      'acceptor',
                      'equilibrium',
                    ],
                    markingCriteria: `5 marks: Explains the Brønsted-Lowry definitions of acids and bases as proton donors and acceptors, and uses a balanced equation to identify both conjugate acid-base pairs and the proton transfer between them
3-4 marks: Explains the definitions and identifies conjugate pairs in an example
2 marks: Defines a Brønsted-Lowry acid or base, or identifies a conjugate pair
1 mark: Provides a relevant fact about acids or bases`,
                    sampleAnswers: [
                      {
                        id: 'sa-seed-6',
                        band: 3,
                        answer:
                          'According to **Brønsted-Lowry** theory, a **conjugate acid-base pair** consists of two species that differ by a single proton (H⁺). In the equilibrium: NH₃ + H₂O ⇌ NH₄⁺ + OH⁻, NH₃ is the base because it **accepts** a proton from water to become NH₄⁺. The NH₄⁺ ion is the **conjugate acid** of NH₃. Similarly, H₂O acts as an acid by donating a proton to become OH⁻, which is its **conjugate base**. Conjugate pairs are always present in acid-base reactions, with the acid donating a proton to form its conjugate base, and the base accepting a proton to form its conjugate acid. This reciprocal relationship is fundamental to understanding acid-base equilibria.',
                        mark: 5,
                        // Fixed: Added missing source property
                        source: 'AI',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

// Fallback initialization function
export const initializeWithQualityData = (): Course[] => {
  // Check for user data first
  const userDataRaw =
    typeof window !== 'undefined' ? window.localStorage.getItem('hsc-ai-evaluator-courses') : null;

  if (userDataRaw) {
    try {
      const parsed = JSON.parse(userDataRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse user data:', e);
    }
  }

  // Return pre-seeded data for first-time users
  return preseededCourses;
};
