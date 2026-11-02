import type { Request } from 'express';
export type Locale = 'id' | 'en';
export function localeFromHeader(header?: string): Locale {
  const choices=(header || '').split(',').map(part=>{const [tag,...params]=part.trim().toLowerCase().split(';');const q=params.find(value=>value.trim().startsWith('q='));return {tag:tag.split('-')[0],quality:q?Number(q.trim().slice(2)):1};}).sort((a,b)=>b.quality-a.quality);
  return choices.find(choice=>choice.quality>0&&['id','en'].includes(choice.tag))?.tag as Locale || 'id';
}
export const requestLocale = (req: Request): Locale => {
  const linked = req.query?.lang;
  if(linked === 'id' || linked === 'en') return linked;
  const preference = req.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith('landly.locale='))?.split('=')[1];
  if(preference === 'id' || preference === 'en') return preference;
  return localeFromHeader(typeof req.headers['accept-language']==='string'?req.headers['accept-language']:undefined);
};
export const outputLanguage = (locale: Locale) => locale === 'id' ? 'Bahasa Indonesia' : 'English';
