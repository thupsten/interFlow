/**
 * Predefined department / job role options for user profiles.
 */
export const DEPARTMENT_OPTIONS = [
  '3D Artist',
  'Admin',
  'Analytics',
  'Content Writer',
  'Customer Support',
  'Data Science',
  'Design',
  'Engineering',
  'Finance',
  'Graphic Designer',
  'HR',
  'Intern',
  'Legal',
  'Marketing',
  'Operations',
  'Product',
  'QA',
  'Research',
  'Sales',
  'SME',
  'UI/UX',
  'Video Production',
  'Web Development',
] as const;

export type Department = (typeof DEPARTMENT_OPTIONS)[number];
