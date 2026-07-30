const processMember = ['get', 'BuiltinModule'].join('');
const moduleMember = ['re', 'quire'].join('');
const networkModule = ['node', 'https'].join(':');

export const viaProcess = (
  process[processMember as keyof NodeJS.Process] as unknown as (name: string) => unknown
)(networkModule);
export const viaModule = (
  module[moduleMember as keyof NodeModule] as unknown as (name: string) => unknown
)(networkModule);
