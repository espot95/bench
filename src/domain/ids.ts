/** Branded string id types — cheap nominal typing to avoid mixing up ids. */

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type PlayerId = Brand<string, 'PlayerId'>;
export type ClubId = Brand<string, 'ClubId'>;
export type LeagueId = Brand<string, 'LeagueId'>;
export type SeasonId = Brand<string, 'SeasonId'>;
export type MatchId = Brand<string, 'MatchId'>;
export type ContractId = Brand<string, 'ContractId'>;

export const asPlayerId = (s: string): PlayerId => s as PlayerId;
export const asClubId = (s: string): ClubId => s as ClubId;
export const asLeagueId = (s: string): LeagueId => s as LeagueId;
export const asSeasonId = (s: string): SeasonId => s as SeasonId;
export const asMatchId = (s: string): MatchId => s as MatchId;
export const asContractId = (s: string): ContractId => s as ContractId;
