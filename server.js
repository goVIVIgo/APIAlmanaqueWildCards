import express from 'express';
import cors from 'cors';
import pool from './db.js';

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Api wildcards rodandinho');
});

app.get('/cartas', async (req, res) => {
  try {
    // Busca as informações da carta(c = carta, a = animal, i = imagem)

    const query = `
      SELECT
        c.*,
        a.nomeCientifico,
        a.descricaoAnimal,
        i.urlImagem
      FROM Cartas c
      JOIN Animais a ON c.animalID = a.animalID
      JOIN Imagens i ON a.imagemID = i.imagemID
    `;
    
    const [rows] = await pool.query(query);
    res.json(rows); // manda os resultados como json
    
  } catch (error) {
    console.error('Erro ao buscar cartas:', error);
    res.status(500).json({ message: 'Erro ao buscar dados das cartas.' });
  }
});

// Requisito: consulta
app.get('/cartas/:id', async (req, res) => {
  try {
    const { id } = req.params; // Pega o ID da URL
    // Busca as informações da carta(c = carta, a = animal, i = imagem)
    const query = ` 
      SELECT 
        c.*, 
        a.nomeCientifico, 
        a.descricaoAnimal, 
        i.urlImagem 
      FROM Cartas c
      JOIN Animais a ON c.animalID = a.animalID
      JOIN Imagens i ON a.imagemID = i.imagemID
      WHERE c.cartaID = ?
    `;
    
    const [rows] = await pool.query(query, [id]);

    // Verifica se encontrou a carta
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Carta não encontrada.' });
    }
    
    res.json(rows[0]); // Envia apenas o primeiro resultado
    
  } catch (error) {
    console.error('Erro ao buscar carta:', error);
    res.status(500).json({ message: 'Erro ao buscar dados da carta.' });
  }
});

// Rota auxiliar para poder criar animais
app.post('/imagens', async (req, res) => {
  try {
    const { urlImagem } = req.body;
    if (!urlImagem) {
      return res.status(400).json({ message: 'urlImagem é obrigatória.' });
    }
    const query = 'INSERT INTO Imagens (urlImagem) VALUES (?)';
    const [result] = await pool.query(query, [urlImagem]);
    res.status(201).json({ 
      message: 'Imagem criada com sucesso!', 
      imagemID: result.insertId 
    });
  } catch (error) {
    console.error('Erro ao inserir imagem:', error);
    res.status(500).json({ message: 'Erro ao inserir imagem.' });
  }
});

// Requisito: inserção
app.post('/animais', async (req, res) => {
  try {
    const { nomeCientifico, descricaoAnimal, imagemID } = req.body;

    if (!nomeCientifico || !imagemID) {
      return res.status(400).json({ message: 'nomeCientifico e imagemID são obrigatórios.' });
    }

    const query = 'INSERT INTO Animais (nomeCientifico, descricaoAnimal, imagemID) VALUES (?, ?, ?)';
    const [result] = await pool.query(query, [nomeCientifico, descricaoAnimal, imagemID]);

    res.status(201).json({ 
      message: 'Animal criado com sucesso!', 
      animalID: result.insertId 
    });

  } catch (error) {
    console.error('Erro ao inserir animal:', error);
    res.status(500).json({ message: 'Erro ao inserir animal.' });
  }
});

// Requisito: "Inserção"
app.post('/cartas', async (req, res) => {
  try {
    const { habilidade, vida, tamanho, ataque, defesa, custo, animalID } = req.body;

    // Validação básica
    if (vida === undefined || ataque === undefined || defesa === undefined || custo === undefined || !animalID) {
      return res.status(400).json({ message: 'Campos obrigatórios (vida, ataque, defesa, custo, animalID) estão faltando.' });
    }
    
    const query = `
      INSERT INTO Cartas (habilidade, vida, tamanho, ataque, defesa, custo, animalID) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(query, [habilidade, vida, tamanho, ataque, defesa, custo, animalID]);

    res.status(201).json({ 
      message: 'Carta criada com sucesso!', 
      cartaID: result.insertId 
    });

  } catch (error){
    console.error('Erro ao inserir carta:', error);
    // Trata erro de violação de chave (ex: animalID já existe em outra carta)
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'Erro: Esse animal já está associado a outra carta.' });
    }
    res.status(500).json({ message: 'Erro ao inserir carta.' });
  }
});

// Requisito: atualização
app.put('/cartas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { habilidade, vida, tamanho, ataque, defesa, custo, animalID } = req.body;

    // Validação
    if (vida === undefined || ataque === undefined || defesa === undefined || custo === undefined || !animalID) {
      return res.status(400).json({ message: 'Campos obrigatórios (vida, ataque, defesa, custo, animalID) estão faltando.' });
    }

    const query = `
      UPDATE Cartas 
      SET habilidade = ?, vida = ?, tamanho = ?, ataque = ?, defesa = ?, custo = ?, animalID = ?
      WHERE cartaID = ?
    `;
    const [result] = await pool.query(query, [habilidade, vida, tamanho, ataque, defesa, custo, animalID, id]);

    // Verifica se alguma linha foi de fato atualizada
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Carta não encontrada para atualizar.' });
    }

    res.json({ message: 'Carta atualizada com sucesso!' });

  } catch (error) {
    console.error('Erro ao atualizar carta:', error);
     if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'Erro: Esse animal já está associado a outra carta.' });
    }
    res.status(500).json({ message: 'Erro ao atualizar carta.' });
  }
});

// Requisito: exclusão
app.delete('/cartas/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    // Se uma falhar, todas falham (rollback).
    connection = await pool.getConnection();
    await connection.beginTransaction();

    //Deleta das tabelas de junção (por causa das Foreign Keys)
    await connection.query('DELETE FROM CartasAcoes WHERE cartaFK = ?', [id]);
    await connection.query('DELETE FROM CartasAtributos WHERE cartaFK = ?', [id]);
    await connection.query('DELETE FROM EfeitosCartas WHERE cartaFK = ?', [id]);
    
    //Deleta da tabela principal cartas
    const [result] = await connection.query('DELETE FROM Cartas WHERE cartaID = ?', [id]);

    //Verifica se a carta existia
    if (result.affectedRows === 0) {
      // Se não deletou nada, a carta não existia. Desfaz a transação.
      await connection.rollback();
      return res.status(404).json({ message: 'Carta não encontrada para deletar.' });
    }

    //Se tudo deu certo, "salva" as alterações no banco
    await connection.commit();
    
    res.json({ message: 'Carta e suas associações foram deletadas com sucesso!' });

  } catch (error) {
    //Se qualquer query falhar, desfaz tudo
    if (connection) {
      await connection.rollback();
    }
    console.error('Erro ao deletar carta:', error);
    res.status(500).json({ message: 'Erro ao deletar carta.' });
  } finally {
    //Devolve a conexão para o pool, independente de sucesso ou falha
    if (connection) {
      connection.release();
    }
  }
});

app.listen(PORT, () => {
  console.log(`servidor backend rodando na porta ${PORT}`);
});