# Ranking

A projeção persistida de rankings é `Repository.ranking` em `../database/repository.ts`.

Mantida próxima da consulta Prisma para evitar carregar todas as pontuações em memória. O engine envia deltas; o repositório agrega por sessão, dia, semana ou histórico geral, sempre com fuso America/Sao_Paulo. Na tela da live o Top 5 usa o estado autoritativo atual para atualização imediata.
