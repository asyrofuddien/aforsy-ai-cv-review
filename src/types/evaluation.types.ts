// ==========================================
// PERSONAL INFORMATION
// ==========================================
export interface Contact {
  label: string;
  url: string | null;
}

export interface PersonalInfo {
  name: string;
  contacts: Contact[];
  summary?: string;
}

// ==========================================
// PROFESSIONAL (Work Experience, Projects)
// ==========================================
export interface ProfessionalItem {
  title: string;
  subtitle?: string;
  location?: string | null;
  date?: string;
  description?: string | null;
  bullets?: string[] | null;
  tags?: string[] | null;
}

export interface ProfessionalSection {
  title: string;
  items: ProfessionalItem[];
}

// ==========================================
// EDUCATION
// ==========================================
export interface EducationItem {
  degree: string;
  school: string;
  year: string;
  gpa?: string | null;
  details?: string | null;
}

export interface EducationSection {
  title: string;
  items: EducationItem[];
}

// ==========================================
// ORGANISATIONAL (Volunteer, Memberships)
// ==========================================
export interface OrganisationalItem {
  title: string;
  subtitle?: string;
  location?: string | null;
  date?: string;
  description?: string | null;
  bullets?: string[] | null;
}

export interface OrganisationalSection {
  title: string;
  items: OrganisationalItem[];
}

// ==========================================
// OTHERS - Skills
// ==========================================
export interface SkillCategory {
  category: string;
  list: string;
}

export interface SkillsSection {
  title: string;
  items: SkillCategory[];
}

// ==========================================
// OTHERS - Awards/Certifications
// ==========================================
export interface AwardItem {
  title: string;
  date?: string;
  issuer?: string;
  description?: string | null;
}

export interface AwardsSection {
  title: string;
  items: AwardItem[];
}

// ==========================================
// OTHERS - Publications
// ==========================================
export interface PublicationItem {
  title: string;
  date?: string;
  authors?: string;
  venue?: string;
  description?: string | null;
}

export interface PublicationsSection {
  title: string;
  items: PublicationItem[];
}

// ==========================================
// OTHERS - Text Sections (Languages, References)
// ==========================================
export interface TextSection {
  title: string;
  content: string;
}

// ==========================================
// OTHERS - List Sections (Interests, Hobbies)
// ==========================================
export interface ListSection {
  title: string;
  items: string[];
}

// ==========================================
// OTHERS - Custom Sections
// ==========================================
export interface CustomItem {
  title: string;
  subtitle?: string;
  date?: string;
  description?: string | null;
  bullets?: string[] | null;
}

export interface CustomSection {
  title: string;
  items: CustomItem[];
}

// ==========================================
// OTHERS - Combined
// ==========================================
export interface OthersSection {
  skills?: SkillsSection[];
  awards?: AwardsSection[];
  publications?: PublicationsSection[];
  text?: TextSection[];
  list?: ListSection[];
  custom?: CustomSection[];
}

// ==========================================
// MAIN RESUME INTERFACE
// ==========================================
export interface ResumeNew {
  personalInfo: PersonalInfo;
  professional?: ProfessionalSection[];
  education?: EducationSection[];
  organisational?: OrganisationalSection[];
  others?: OthersSection;
  code: string;
}

// ==========================================
// LEGACY INTERFACES (Keep for backward compatibility)
// ==========================================
export interface Experience {
  title: string;
  company: string;
  location: string;
  duration: string;
  description: string;
  bullets: string[];
}

export interface Education {
  degree: string;
  school: string;
  gpa: string;
  year: string;
}

export interface ProjectOrCertification {
  title: string;
  place?: string;
  company?: string;
  location?: string;
  duration?: string;
  date?: string;
  description?: string;
  bullets: string[];
}

export interface Skills {
  Languages: string;
  'Frameworks & Libraries': string;
  Databases: string;
  'Tools & Technologies': string;
  'Other Skills': string;
}

export interface Resume {
  name: string;
  phone: string;
  location: string;
  email: string;
  linkedin: string;
  github: string;
  portfolio: string;
  summary: string;
  experience: Experience[];
  education: Education[];
  project_and_certification: ProjectOrCertification[];
  skills: Skills;
  languages: string;
  code: string;
}

export interface EvaluationRequest {
  cvDocumentId: string;
  jobDescriptionId: string;
  candidateName?: string;
}

export interface CVMatcherRequest {
  cvDocumentId: string;
}

export interface EvaluationResult {
  cvMatchRate: number;
  cvFeedback: string;
  projectScore: number;
  projectFeedback: string;
  overallSummary: string;
  detailedScores?: DetailedScores;
  recommendation: string;
}

export interface DetailedScores {
  // CV Scores (1-5 each)
  technicalSkillsMatch: number;
  experienceLevel: number;
  relevantAchievements: number;
  culturalFit: number;

  // Project Scores (1-5 each)
  correctness: number;
  codeQuality: number;
  resilience: number;
  documentation: number;
  creativity: number;
}

export type EvaluationStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface CVExtractedInfo {
  name?: string;
  email?: string;
  skills: string[];
  experiences: Experience[];
  education: Education[];
  projects: Project[];
}

export interface Project {
  name: string;
  description: string;
  technologies: string[];
}

export interface JobListing {
  title: string;
  company: string;
  location: string;
  salary_range: string; // snake_case sesuai preferensi DB
  job_type: string;
  requirements: string[];
  responsibilities: string[];
  posted_at: string; // ISO date string
  link: string;
  seniority: string;
  job_description: string;
}
