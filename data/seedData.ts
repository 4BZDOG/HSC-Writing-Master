import { Course } from '../types';
import { NESA_PERFORMANCE_BAND_DESCRIPTORS } from './performanceBands';

// Pre-generated, teacher-reviewed data for immediate use
export const preseededCourses: Course[] = [
  {
    id: 'course-bio-advanced',
    name: 'HSC Biology (Advanced)',
    outcomes: [
      { code: 'BIO11-1', description: 'develops and evaluates questions and hypotheses for scientific investigation' },
      { code: 'BIO11-2', description: 'designs and evaluates investigations in order to obtain primary and secondary data and information' },
      { code: 'BIO11-3', description: 'conducts investigations to collect valid and reliable primary and secondary data and information' },
      { code: 'BIO11-4', description: 'selects and processes appropriate qualitative and quantitative data and information using a range of appropriate media' },
      { code: 'BIO11-5', description: 'analyses and evaluates primary and secondary data and information' },
      { code: 'BIO11-6', description: 'solves scientific problems using primary and secondary data, critical thinking skills and scientific processes' },
      { code: 'BIO11-7', description: 'communicates scientific understanding using suitable language and terminology for a specific audience or purpose' },
      { code: 'BIO11-8', description: 'describes single cells as the basis for all life' },
      { code: 'BIO11-9', description: 'explains the structure and function of cells and cell parts' },
      { code: 'BIO11-10', description: 'describes the structure and function of enzymes' },
      { code: 'BIO12-12', description: 'explains the structures of DNA and analyses the mechanisms of inheritance and how processes of reproduction ensure continuity of species' },
      { code: 'BIO12-13', description: 'explains natural genetic change and the use of genetic technologies to induce genetic change' },
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
                    question: 'Explain how DNA replication ensures genetic continuity from one generation to the next.',
                    totalMarks: 7,
                    verb: 'EXPLAIN',
                    highlightedQuestion: '**Explain** how DNA replication ensures *genetic continuity* from one generation to the next.',
                    scenario: "A biology student is preparing a presentation on cell division and needs to explain why DNA replication is crucial for inheritance. They must articulate the mechanisms that ensure accuracy.",
                    linkedOutcomes: ['BIO12-12'],
                    estimatedTime: "12 minutes",
                    relatedTopics: ["DNA structure", "Semi-conservative replication", "Cell cycle"],
                    prerequisiteKnowledge: ["DNA double helix structure", "Nucleotide composition"],
                    markerNotes: [
                      "Look for key terms: semi-conservative, complementary base pairing, DNA polymerase, accuracy/proofreading",
                      "Award marks for describing both the process and its significance",
                      "Mentioning leading/lagging strands shows deeper understanding"
                    ],
                    commonStudentErrors: [
                      "Confusing transcription with replication",
                      "Omitting the role of enzymes",
                      "Not explaining WHY it's called semi-conservative"
                    ],
                    keywords: ["semi-conservative", "DNA polymerase", "helicase", "complementary base pairing", "nucleotides", "genetic continuity", "proofreading"],
                    markingCriteria: `- 1-2 marks: Basic identification of replication purpose or key enzyme
- 3-4 marks: Describes the process with some detail (unwinding, base pairing)
- 5-6 marks: Explains semi-conservative nature and role of multiple enzymes
- 7 marks: Comprehensive explanation linking mechanism to genetic continuity with precise terminology`,
                    sampleAnswers: [
                      {
                        id: 'sa-seed-1',
                        band: 6,
                        answer: "DNA replication ensures genetic continuity through its **semi-conservative** mechanism, where each new DNA molecule consists of one original and one newly synthesized strand. The process begins with **helicase** unwinding the double helix, creating two template strands. **DNA polymerase** then adds complementary nucleotides (A-T, G-C) to each template in a 5' to 3' direction. On the leading strand, synthesis is continuous, while the lagging strand is synthesized discontinuously in Okazaki fragments. **DNA ligase** joins these fragments. Crucially, DNA polymerase has **proofreading** ability, correcting errors to maintain genetic fidelity. This ensures that each daughter cell receives an exact copy of the parent DNA, preserving genetic information across generations.",
                        mark: 7
                      },
                      {
                        id: 'sa-seed-2',
                        band: 1,
                        answer: "DNA replication is when cells copy their DNA before dividing.",
                        mark: 0
                      }
                    ],
                    targetPerformanceBands: [5, 6]
                  },
                  {
                    id: 'prompt-dna-replication-4',
                    question: 'Describe the key steps involved in DNA replication.',
                    totalMarks: 4,
                    verb: 'DESCRIBE',
                    highlightedQuestion: '**Describe** the key steps involved in DNA replication.',
                    keywords: ["unwinding", "helicase", "DNA polymerase", "complementary base pairing", "nucleotides"],
                    sampleAnswers: [
                      {
                        id: 'sa-seed-3',
                        band: 6,
                        answer: "DNA replication involves three main steps. First, the double helix **unwinds** as **helicase** breaks the hydrogen bonds between base pairs, creating two template strands. Second, **DNA polymerase** reads each template and adds complementary **nucleotides** (A with T, G with C) to build new strands. Third, these new nucleotides are joined together to form complete DNA molecules, with each final molecule containing one original and one new strand.",
                        mark: 4
                      }
                    ],
                    targetPerformanceBands: [4, 5]
                  }
                ]
              },
              {
                id: 'dp-protein-synthesis',
                description: 'Model the process of protein synthesis.',
                prompts: [
                  {
                    id: 'prompt-protein-synthesis-8',
                    question: 'Analyse the relationship between DNA, mRNA, and protein synthesis in expressing genetic information.',
                    totalMarks: 8,
                    verb: 'ANALYSE',
                    highlightedQuestion: '**Analyse** the *relationship* between DNA, mRNA, and protein synthesis in expressing genetic information.',
                    scenario: "A geneticist is investigating how a mutation in the CFTR gene leads to cystic fibrosis. They need to trace the flow of genetic information from DNA to functional protein to understand the disease mechanism.",
                    linkedOutcomes: ['BIO12-12', 'BIO12-13'],
                    estimatedTime: "15 minutes",
                    relatedTopics: ["Central dogma", "Transcription", "Translation", "Gene expression"],
                    prerequisiteKnowledge: ["DNA structure", "RNA types", "Ribosome function"],
                    markerNotes: [
                      "Must address all three components: DNA, mRNA, and protein synthesis",
                      "Look for understanding of transcription and translation",
                      "Award higher marks for linking structure to function"
                    ],
                    commonStudentErrors: [
                      "Confusing transcription and translation",
                      "Forgetting that mRNA is the intermediate",
                      "Not explaining how the process results in a functional protein"
                    ],
                    keywords: ["transcription", "translation", "mRNA", "ribosome", "codon", "amino acid", "central dogma", "gene expression"],
                    markingCriteria: `- 6-7 marks: Analyzes key components and relationships
- 8 marks: Sophisticated analysis linking all components with detailed mechanism`,
                    sampleAnswers: [
                      {
                        id: 'sa-seed-4',
                        band: 6,
                        answer: "The relationship between DNA, mRNA, and protein synthesis represents the **central dogma** of molecular biology. **DNA** contains the genetic code in its sequence of nucleotides. During **transcription**, a specific gene is copied into **mRNA** by RNA polymerase, with introns removed and exons spliced together. This mRNA then travels to the cytoplasm where **translation** occurs. **Ribosomes** read the mRNA in codons (triplets of nucleotides), each specifying a particular **amino acid**. tRNA molecules bring the correct amino acids, which are joined together to form a polypeptide chain that folds into a functional **protein**. Thus, DNA's information is transcribed into mRNA and then translated into protein, creating the direct link between genotype and phenotype.",
                        mark: 8
                      }
                    ],
                    targetPerformanceBands: [5, 6]
                  }
                ]
              }
            ]
          }
        ]
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
                description: 'Evaluate the uses and applications of polymerase chain reaction (PCR) in biotechnology.',
                prompts: [
                  {
                    id: 'prompt-pcr-evaluation-10',
                    question: 'Evaluate the significance of PCR as a tool in modern biotechnology, considering both its applications and limitations.',
                    totalMarks: 10,
                    verb: 'EVALUATE',
                    highlightedQuestion: '**Evaluate** the *significance* of PCR as a tool in modern biotechnology, considering both its applications and limitations.',
                    scenario: "A biotechnology company is deciding whether to invest in PCR equipment for their diagnostics lab. As a consultant, you must provide a balanced evaluation of this technology's value.",
                    linkedOutcomes: ['BIO12-13'],
                    estimatedTime: "18 minutes",
                    relatedTopics: ["DNA amplification", "Forensics", "Medical diagnostics", "Genetic research"],
                    prerequisiteKnowledge: ["DNA structure", "Enzyme function", "Thermostable DNA polymerase"],
                    markerNotes: [
                      "Must evaluate both applications AND limitations",
                      "Look for specific examples across multiple fields",
                      "High marks require balanced, critical judgment"
                    ],
                    commonStudentErrors: [
                      "Only listing applications without evaluation",
                      "Forgetting to mention limitations",
                      "Not providing specific examples"
                    ],
                    keywords: ["amplification", "DNA polymerase", "thermocycler", "diagnostics", "forensics", "genetic screening", "quantitative PCR", "limitations", "contamination"],
                    markingCriteria: `- 8-9 marks: Sound evaluation with clear criteria and evidence
- 10 marks: Critical evaluation with balanced arguments and sophisticated synthesis`,
                    sampleAnswers: [
                      {
                        id: 'sa-seed-5',
                        band: 6,
                        answer: "PCR has revolutionized biotechnology since its development in the 1980s, with **significant** applications across multiple fields. In **forensics**, PCR enables DNA profiling from minute crime scene samples, solving cold cases and exonerating the innocent. In **medicine**, it diagnoses genetic disorders and infectious diseases by detecting pathogen DNA, as seen in COVID-19 testing. **Quantitative PCR** allows precise measurement of gene expression, advancing cancer research. However, limitations exist. PCR is highly sensitive to **contamination**—a single DNA molecule can create false positives. It requires high-quality, intact DNA templates and expensive **thermocycler** equipment. Additionally, PCR amplifies specific sequences but doesn't provide functional context. Despite these limitations, its ability to generate millions of DNA copies rapidly makes PCR indispensable, though results must be interpreted alongside other molecular techniques for robust conclusions.",
                        mark: 10
                      }
                    ],
                    targetPerformanceBands: [5, 6]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'course-chemistry-advanced',
    name: 'HSC Chemistry (Advanced)',
    outcomes: [
      { code: 'CH11-1', description: 'develops and evaluates questions and hypotheses for scientific investigation' },
      { code: 'CH11-2', description: 'designs and evaluates investigations in order to obtain primary and secondary data and information' },
      { code: 'CH11-3', description: 'conducts investigations to collect valid and reliable primary and secondary data and information' },
      { code: 'CH11-4', description: 'selects and processes appropriate qualitative and quantitative data and information using a range of appropriate media' },
      { code: 'CH11-5', description: 'analyses and evaluates primary and secondary data and information' },
      { code: 'CH11-6', description: 'solves scientific problems using primary and secondary data, critical thinking skills and scientific processes' },
      { code: 'CH11-7', description: 'communicates scientific understanding using suitable language and terminology for a specific audience or purpose' },
      { code: 'CH11-8', description: 'describes the atomic structure and properties of elements' },
      { code: 'CH11-9', description: 'describes the composition and reactions of carbon compounds' },
      { code: 'CH12-12', description: 'explains the characteristics of equilibrium systems' },
      { code: 'CH12-13', description: 'explains and quantitatively analyses acids and bases using contemporary models' },
      { code: 'CH12-14', description: 'explains and quantifies enthalpy changes in chemical reactions' },
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
                description: 'Investigate the use of the Brønsted-Lowry theory to describe acid/base conjugate pairs.',
                prompts: [
                  {
                    id: 'prompt-conjugate-pairs-5',
                    question: 'Explain how the Brønsted-Lowry theory defines conjugate acid-base pairs using a specific chemical example.',
                    totalMarks: 5,
                    verb: 'EXPLAIN',
                    highlightedQuestion: '**Explain** how the Brønsted-Lowry theory defines *conjugate acid-base pairs* using a specific chemical example.',
                    scenario: "A chemistry student is preparing a practical report on acid-base titrations and needs to explain the concept of conjugate pairs to demonstrate their understanding of the underlying theory.",
                    linkedOutcomes: ['CH12-13'],
                    estimatedTime: "10 minutes",
                    relatedTopics: ["Acid-base equilibrium", "pH", "Equilibrium constants"],
                    prerequisiteKnowledge: ["Brønsted-Lowry acid/base definition", "Chemical equilibrium basics"],
                    markerNotes: [
                      "Must include a specific chemical example (e.g., NH₃/NH₄⁺ or H₂O/H₃O⁺)",
                      "Look for clear explanation of proton transfer",
                      "Award marks for correct identification of both species in the pair"
                    ],
                    commonStudentErrors: [
                      "Forgetting that the conjugate differs by one H⁺",
                      "Choosing an example that doesn't form a clear conjugate pair",
                      "Confusing conjugate pairs with amphiprotic substances"
                    ],
                    keywords: ["Brønsted-Lowry", "conjugate acid", "conjugate base", "proton transfer", "donor", "acceptor", "equilibrium"],
                    markingCriteria: `- 3-4 marks: Explains definition with basic example
- 5 marks: Clear explanation with detailed example showing proton transfer`,
                    sampleAnswers: [
                      {
                        id: 'sa-seed-6',
                        band: 6,
                        answer: "According to **Brønsted-Lowry** theory, a **conjugate acid-base pair** consists of two species that differ by a single proton (H⁺). In the equilibrium: NH₃ + H₂O ⇌ NH₄⁺ + OH⁻, NH₃ is the base because it **accepts** a proton from water to become NH₄⁺. The NH₄⁺ ion is the **conjugate acid** of NH₃. Similarly, H₂O acts as an acid by donating a proton to become OH⁻, which is its **conjugate base**. Conjugate pairs are always present in acid-base reactions, with the acid donating a proton to form its conjugate base, and the base accepting a proton to form its conjugate acid. This reciprocal relationship is fundamental to understanding acid-base equilibria.",
                        mark: 5
                      }
                    ],
                    targetPerformanceBands: [5, 6]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
];

// Fallback initialization function
export const initializeWithQualityData = (): Course[] => {
  // Check for user data first
  const userDataRaw = typeof window !== 'undefined' 
    ? window.localStorage.getItem('hsc-ai-evaluator-courses')
    : null;
    
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