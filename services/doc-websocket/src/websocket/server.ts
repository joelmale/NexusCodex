import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { WSMessageSchema, IncomingEventType } from '../types/events';
import { handleSessionCreate, handleSessionJoin, handleSessionLeave, handleSessionUpdateSettings } from '../handlers/session.handler';
import { handlePageChange, handleScrollSync } from '../handlers/navigation.handler';
import { handlePushPage, handlePushReference } from '../handlers/push.handler';
import { handleAnnotationCreate, handleAnnotationUpdate, handleAnnotationDelete } from '../handlers/annotation.handler';
import { sessionService } from '../services/session.service';

interface ExtendedWebSocket extends WebSocket {
  sessionId?: string;
  userId?: string;
  isAlive?: boolean;
}

export class DocumentWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, Set<ExtendedWebSocket>>; // sessionId -> Set of connections
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.clients = new Map();
    this.setupConnectionHandler();
    this.setupHeartbeat();
  }

  /**
   * Set up WebSocket connection handler
   */
  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws: ExtendedWebSocket, request: IncomingMessage) => {
      console.log('New WebSocket connection established');

      ws.isAlive = true;

      // Handle pong responses for heartbeat
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle incoming messages
      ws.on('message', async (data: WebSocket.Data) => {
        await this.handleMessage(ws, data);
      });

      // Handle connection close
      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(ws: ExtendedWebSocket, data: WebSocket.Data): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      const validatedMessage = WSMessageSchema.parse(message);

      console.log('Received message:', validatedMessage.type);

      // Route message to appropriate handler
      switch (validatedMessage.type) {
        case IncomingEventType.SESSION_CREATE:
          await handleSessionCreate(ws, validatedMessage.data);
          break;

        case IncomingEventType.SESSION_JOIN:
          await this.handleJoin(ws, validatedMessage.data);
          break;

        case IncomingEventType.SESSION_LEAVE:
          await handleSessionLeave(ws, validatedMessage.data, this.broadcast.bind(this), ws.userId);
          break;

        case IncomingEventType.SESSION_UPDATE_SETTINGS:
          await handleSessionUpdateSettings(ws, validatedMessage.data, this.broadcast.bind(this));
          break;

        case IncomingEventType.PAGE_CHANGE:
          await handlePageChange(ws, validatedMessage.data, this.broadcast.bind(this));
          break;

        case IncomingEventType.SCROLL_SYNC:
          await handleScrollSync(ws, validatedMessage.data, this.broadcast.bind(this));
          break;

        case IncomingEventType.PUSH_PAGE:
          await handlePushPage(ws, validatedMessage.data, this.broadcast.bind(this));
          break;

        case IncomingEventType.PUSH_REFERENCE:
          await handlePushReference(ws, validatedMessage.data, this.broadcast.bind(this));
          break;

        case IncomingEventType.ANNOTATION_CREATE:
          await handleAnnotationCreate(ws, validatedMessage.data, this.broadcast.bind(this));
          break;

        case IncomingEventType.ANNOTATION_UPDATE:
          await handleAnnotationUpdate(ws, validatedMessage.data, this.broadcast.bind(this));
          break;

        case IncomingEventType.ANNOTATION_DELETE:
          await handleAnnotationDelete(ws, validatedMessage.data, this.broadcast.bind(this));
          break;

        default:
          ws.send(
            JSON.stringify({
              type: 'error',
              data: { message: 'Unknown event type' },
            })
          );
      }
    } catch (error: any) {
      console.error('Error handling message:', error.message);
      ws.send(
        JSON.stringify({
          type: 'error',
          data: { message: 'Invalid message format', error: error.message },
        })
      );
    }
  }

  /**
   * Handle session join with room tracking
   */
  private async handleJoin(ws: ExtendedWebSocket, data: unknown): Promise<void> {
    await handleSessionJoin(ws, data, this.broadcast.bind(this));

    // Extract sessionId and userId from the payload
    const payload = data as { sessionId: string; userId: string };

    // Add client to room
    ws.sessionId = payload.sessionId;
    ws.userId = payload.userId;

    if (!this.clients.has(payload.sessionId)) {
      this.clients.set(payload.sessionId, new Set());
    }
    this.clients.get(payload.sessionId)!.add(ws);

    // Refresh session TTL on activity
    await sessionService.refreshSession(payload.sessionId);
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(ws: ExtendedWebSocket): void {
    console.log('Client disconnected');

    if (ws.sessionId) {
      const sessionClients = this.clients.get(ws.sessionId);
      if (sessionClients) {
        sessionClients.delete(ws);

        // Remove empty session rooms
        if (sessionClients.size === 0) {
          this.clients.delete(ws.sessionId);
        }
      }

      // Handle implicit leave if user was in a session
      if (ws.userId) {
        sessionService.removeViewer(ws.sessionId, ws.userId).catch((error) => {
          console.error('Error removing viewer on disconnect:', error);
        });

        // Notify others in the session
        this.broadcast(
          ws.sessionId,
          JSON.stringify({
            type: 'session:left',
            data: { userId: ws.userId },
          }),
          ws
        );
      }
    }
  }

  /**
   * Broadcast message to all clients in a session
   */
  private broadcast(sessionId: string, message: string, exclude?: WebSocket): void {
    const sessionClients = this.clients.get(sessionId);
    if (!sessionClients) {
      return;
    }

    sessionClients.forEach((client) => {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Set up heartbeat to detect dead connections
   */
  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: WebSocket) => {
        const extWs = ws as ExtendedWebSocket;

        if (extWs.isAlive === false) {
          console.log('Terminating dead connection');
          return extWs.terminate();
        }

        extWs.isAlive = false;
        extWs.ping();
      });
    }, 30000); // 30 seconds
  }

  /**
   * Shutdown the WebSocket server
   */
  public shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.wss.clients.forEach((client) => {
      client.close();
    });

    this.wss.close();
    console.log('WebSocket server shut down');
  }
}
