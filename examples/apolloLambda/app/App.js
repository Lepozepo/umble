const { ApolloServer, gql } = require('apollo-server-lambda');

// const pubsub = new PubSub();

// const typeDefs = gql`
//   type Book {
//     title: String
//     author: String
//   }
// 
//   type Query {
//     books: [Book]
//   }
// 
//   type Subscription {
//     bookAdded: Book
//   }
// 
//   type Mutation {
//     addBook(author: String, title: String): Book
//   }
// `;

const typeDefs = gql`
  type Book {
    title: String
    author: String
  }

  type Query {
    books: [Book]
  }

  type Mutation {
    addBook(author: String, title: String): Book
  }
`;

const books = [
  {
    title: 'Harry Potter and the Chamber of Secrets',
    author: 'J.K. Rowling',
  },
  {
    title: 'Jurassic Park',
    author: 'Michael Crichton',
  },
];

const resolvers = {
  // Subscription: {
  //   bookAdded: {
  //     subscribe: () => pubsub.asyncIterator(['BOOK_ADDED']),
  //   },
  // },
  Query: {
    books: () => books,
  },
  Mutation: {
    addBook(_, book) {
      // pubsub.publish('BOOK_ADDED', { bookAdded: book });
      books.push(book);
      return book;
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  playgroud: true,
  introspection: true,
});

exports.handler = function handler(event, ctx, cb) {
  const originalHandler = server.createHandler();

  if (event.isBase64Encoded) {
    // eslint-disable-next-line
    event.body = Buffer.from(event.body, 'base64').toString();
  }

  return originalHandler(event, ctx, cb);
};
