const { ApolloServer, gql, PubSub } = require('apollo-server');

const pubsub = new PubSub();

const typeDefs = gql`
  type Book {
    title: String
    author: String
  }

  type Query {
    books: [Book]
  }

  type Subscription {
    bookAdded: Book
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
  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterator(['BOOK_ADDED']),
    },
  },
  Query: {
    books: () => books,
  },
  Mutation: {
    addBook(_, book) {
      pubsub.publish('BOOK_ADDED', { bookAdded: book });
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

server.listen().then(({ url, subscriptionsUrl }) => {
  console.log(`Server ready at ${url}`);
  console.log(`Subscriptions ready at ${subscriptionsUrl}`);
});
