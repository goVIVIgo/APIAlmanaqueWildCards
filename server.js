import express from 'express';
import cors from 'cors';
import pool from './db.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
// Configura o armazenamento de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'public/uploads');

    fs.mkdirSync(uploadPath, { recursive: true });

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
// Cria o middleware
const upload = multer({ storage: storage });
// Requisito: upload
app.post('/upload', upload.single('imagem'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhum arquivo enviado.' });
    }
    // Define a URL da imagem
    const fileUrl = `/uploads/${req.file.filename}`;

    res.status(201).json({
      message: 'Upload bem-sucedido!',
      url: fileUrl
    });

  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ message: 'Erro ao processar upload.' });
  }
});

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
    const { id } = req.params;

    // 1. Busca a informação principal da carta
    const queryCarta = ` 
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
    const [rows] = await pool.query(queryCarta, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Carta não encontrada.' });
    }

    const carta = rows[0];

    const queryAcoes = `
      SELECT a.* FROM Acoes a
      JOIN CartasAcoes ca ON a.acaoID = ca.acaoFK
      WHERE ca.cartaFK = ?
    `;
    const [acoes] = await pool.query(queryAcoes, [id]);
    carta.acoes = acoes;

    const queryAtributos = `
      SELECT at.* FROM Atributos at
      JOIN CartasAtributos cat ON at.atributoID = cat.atributoFK
      WHERE cat.cartaFK = ?
    `;
    const [atributos] = await pool.query(queryAtributos, [id]);
    carta.atributos = atributos;

    res.json(carta);

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

app.post('/cartas', async (req, res) => {
  let connection;
  try {
    const {
      habilidade, vida, tamanho, ataque, defesa, custo, animalID,
      acoesIds, atributosIds, efeitosIds
    } = req.body;

    if (vida === undefined || ataque === undefined || defesa === undefined || custo === undefined || !animalID) {
      return res.status(400).json({ message: 'Campos obrigatórios (vida, ataque, defesa, custo, animalID) estão faltando.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const queryCarta = `
      INSERT INTO Cartas (habilidade, vida, tamanho, ataque, defesa, custo, animalID) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await connection.query(queryCarta, [habilidade, vida, tamanho, ataque, defesa, custo, animalID]);
    const newCartaId = result.insertId;

    if (acoesIds && acoesIds.length > 0) {
      const acoesValues = acoesIds.map(id => [newCartaId, id]);
      await connection.query('INSERT INTO CartasAcoes (cartaFK, acaoFK) VALUES ?', [acoesValues]);
    }

    if (atributosIds && atributosIds.length > 0) {
      const atributosValues = atributosIds.map(id => [newCartaId, id]);
      await connection.query('INSERT INTO CartasAtributos (cartaFK, atributoFK) VALUES ?', [atributosValues]);
    }
    await connection.commit();

    res.status(201).json({
      message: 'Carta e suas associações criadas com sucesso!',
      cartaID: newCartaId
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Erro ao inserir carta:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Erro: Esse animal já está associado a outra carta.' });
    }
    res.status(500).json({ message: 'Erro ao inserir carta.' });
  }
});

// Requisito: atualização
app.put('/cartas/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const {
      habilidade, vida, tamanho, ataque, defesa, custo, animalID,
      acoesIds, atributosIds, efeitosIds 
    } = req.body;

    if (vida === undefined || ataque === undefined || defesa === undefined || custo === undefined || !animalID) {
      return res.status(400).json({ message: 'Campos obrigatórios (vida, ataque, defesa, custo, animalID) estão faltando.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const queryUpdate = `
      UPDATE Cartas 
      SET habilidade = ?, vida = ?, tamanho = ?, ataque = ?, defesa = ?, custo = ?, animalID = ?
      WHERE cartaID = ?
    `;
    const [result] = await connection.query(queryUpdate, [habilidade, vida, tamanho, ataque, defesa, custo, animalID, id]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Carta não encontrada para atualizar.' });
    }

    await connection.query('DELETE FROM CartasAcoes WHERE cartaFK = ?', [id]);
    await connection.query('DELETE FROM CartasAtributos WHERE cartaFK = ?', [id]);
    await connection.query('DELETE FROM EfeitosCartas WHERE cartaFK = ?', [id]);

    if (acoesIds && acoesIds.length > 0) {
      const acoesValues = acoesIds.map(acaoId => [id, acaoId]);
      await connection.query('INSERT INTO CartasAcoes (cartaFK, acaoFK) VALUES ?', [acoesValues]);
    }
    if (atributosIds && atributosIds.length > 0) {
      const atributosValues = atributosIds.map(attrId => [id, attrId]);
      await connection.query('INSERT INTO CartasAtributos (cartaFK, atributoFK) VALUES ?', [atributosValues]);
    }

    await connection.commit();
    res.json({ message: 'Carta e associações atualizadas com sucesso!' });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
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

app.get('/atributos', async (req, res) => {
  try {
    const query = 'SELECT * FROM Atributos';
    const [rows] = await pool.query(query);
    res.json(rows);

  } catch (error) {
    console.error('Erro ao buscar atributos:', error);
    res.status(500).json({ message: 'Erro ao buscar dados dos atributos.' });
  }
});

app.post('/atributos', async (req, res) => {
  try {
    const { nomeAtributo, descricaoAtributo } = req.body;

    if (!nomeAtributo) {
      return res.status(400).json({ message: 'nomeAtributo é obrigatório.' });
    }

    const query = 'INSERT INTO Atributos (nomeAtributo, descricaoAtributo) VALUES (?, ?)';
    const [result] = await pool.query(query, [nomeAtributo, descricaoAtributo]);

    res.status(201).json({
      message: 'Atributo criado com sucesso!',
      atributoID: result.insertId
    });

  } catch (error) {
    console.error('Erro ao inserir atributo:', error);
    res.status(500).json({ message: 'Erro ao inserir atributo.' });
  }
});

app.get('/acoes', async (req, res) => {
  try {
    const query = 'SELECT * FROM Acoes';
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar acoes:', error);
    res.status(500).json({ message: 'Erro ao buscar dados das acoes.' });
  }
});

app.post('/acoes', async (req, res) => {
  try {
    const { nome, descricao } = req.body;

    if (!nome) {
      return res.status(400).json({ message: 'nome (que será salvo como custo) é obrigatório.' });
    }

    const query = 'INSERT INTO Acoes (custo, descricaoAcao) VALUES (?, ?)';
    const [result] = await pool.query(query, [nome, descricao]);

    res.status(201).json({
      message: 'Ação criada com sucesso!',
      acaoID: result.insertId
    });

  } catch (error) {
    console.error('Erro ao inserir acao:', error);
    res.status(500).json({ message: 'Erro ao inserir acao.' });
  }
});

app.get('/efeitos', async (req, res) => {
  try {
    const query = 'SELECT * FROM Efeitos';
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar efeitos:', error);
    res.status(500).json({ message: 'Erro ao buscar dados dos efeitos.' });
  }
});

app.post('/efeitos', async (req, res) => {
  try {
    const { nome, descricao } = req.body;

    if (!nome) {
      return res.status(400).json({ message: 'nome (para nomeEfeito) é obrigatório.' });
    }

    const query = 'INSERT INTO Efeitos (nomeEfeito, descricaoEfeito) VALUES (?, ?)';
    const [result] = await pool.query(query, [nome, descricao]);

    res.status(201).json({
      message: 'Efeito criado com sucesso!',
      efeitoID: result.insertId
    });

  } catch (error) {
    console.error('Erro ao inserir efeito:', error);
    res.status(500).json({ message: 'Erro ao inserir efeito.' });
  }
});

app.get('/animais', async (req, res) => {
  try {
    // Busca animais e já junta a imagem
    const query = `
      SELECT 
        a.*,
        i.urlImagem
      FROM Animais a
      JOIN Imagens i ON a.imagemID = i.imagemID
    `;
    const [rows] = await pool.query(query);
    res.json(rows);

  } catch (error) {
    console.error('Erro ao buscar animais:', error);
    res.status(500).json({ message: 'Erro ao buscar dados dos animais.' });
  }
});

app.listen(PORT, () => {
  console.log(`servidor backend rodando na porta ${PORT}`);
});