import { JobListing } from '../model/job.types';

export function getDummyJobs(): JobListing[] {
  return [
    {
      title: 'Backend Engineer (Dummy Data)',
      company: 'Tokopedia',
      location: 'Jakarta, Indonesia',
      salary_range: 'IDR 15.000.000 – 25.000.000',
      job_type: 'Full-time',
      seniority: 'Mid-level',
      requirements: ['Node.js', 'Express', 'MongoDB', 'RESTful APIs', 'Docker'],
      responsibilities: [
        'Develop and maintain scalable backend services',
        'Design and implement RESTful APIs',
        'Collaborate with frontend and DevOps teams',
        'Write unit and integration tests',
      ],
      job_description:
        'Sebagai Backend Engineer di Tokopedia, kamu akan bertanggung jawab mengembangkan dan memelihara layanan backend yang scalable, mendesain API yang efisien, serta bekerja sama dengan tim lintas fungsi untuk menghadirkan solusi berkualitas tinggi.',
      posted_at: '2025-11-05',
      link: 'https://www.linkedin.com/jobs/view/backend-engineer-at-tokopedia-12345',
    },
    {
      title: 'Video Editor  (Dummy Data)',
      company: 'Creative Studio Indonesia',
      location: 'Jakarta, Indonesia',
      salary_range: 'IDR 8.000.000 – 15.000.000',
      job_type: 'Full-time',
      seniority: 'Mid-level',
      requirements: [
        'Adobe Premiere Pro',
        'After Effects',
        'DaVinci Resolve',
        'Color Grading',
        'Motion Graphics',
      ],
      responsibilities: [
        'Edit video content for various platforms (YouTube, Instagram, TikTok)',
        'Create engaging motion graphics and animations',
        'Collaborate with content creators and directors',
        'Manage multiple projects with tight deadlines',
      ],
      job_description:
        'Join our creative team as a Video Editor to produce high-quality video content for brands and digital platforms. Work with modern editing tools and collaborate with talented creators.',
      posted_at: '2025-11-03',
      link: 'https://www.linkedin.com/jobs/view/video-editor-at-creative-studio-67890',
    },
    {
      title: 'Digital Marketing Specialist  (Dummy Data)',
      company: 'Marketing Agency',
      location: 'Jakarta, Indonesia',
      salary_range: 'IDR 10.000.000 – 18.000.000',
      job_type: 'Full-time',
      seniority: 'Mid-level',
      requirements: ['Google Ads', 'Facebook Ads', 'SEO', 'Google Analytics', 'Content Marketing'],
      responsibilities: [
        'Plan and execute digital marketing campaigns',
        'Manage social media advertising budgets',
        'Analyze campaign performance and optimize ROI',
        'Create marketing reports and presentations',
      ],
      job_description:
        'We are looking for a Digital Marketing Specialist to drive online growth for our clients through strategic campaigns and data-driven decisions.',
      posted_at: '2025-10-28',
      link: 'https://www.linkedin.com/jobs/view/digital-marketing-at-agency-11223',
    },
  ];
}
