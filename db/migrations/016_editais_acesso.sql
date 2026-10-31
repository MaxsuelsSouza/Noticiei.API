-- Lista geral (Todos, Rumores, Editais): só concursos que você pode fazer (seu diploma, curso técnico ou sem diploma);
-- concurso só de cargo com formação específica (médico, juiz, engenheiro…) sai. Força o recálculo de todos.
update concursos set visivel_geral = null;
