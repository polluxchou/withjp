// 由 `npm run gen:types`（scripts/gen-db-types.mjs）从线上 schema 生成，勿手改。
// 迁移在线上应用之后重新生成并提交；见 supabase/migrations/README.md「数据库类型」。
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      activity_events: {
        Row: {
          action: Database['public']['Enums']['activity_action']
          actor_agent_id: string | null
          actor_type: Database['public']['Enums']['activity_actor_type']
          actor_user_id: string | null
          after: Json | null
          archived_at: string | null
          before: Json | null
          content: string | null
          context: NonNullable<Json>
          created_at: string
          diff: Json | null
          entity_id: string
          entity_type: Database['public']['Enums']['activity_entity']
          id: string
        }
        ComputedFields: never
        Insert: {
          action: Database['public']['Enums']['activity_action']
          actor_agent_id?: string | null
          actor_type: Database['public']['Enums']['activity_actor_type']
          actor_user_id?: string | null
          after?: Json | null
          archived_at?: string | null
          before?: Json | null
          content?: string | null
          context?: NonNullable<Json>
          created_at?: string
          diff?: Json | null
          entity_id: string
          entity_type: Database['public']['Enums']['activity_entity']
          id?: string
        }
        Update: {
          action?: Database['public']['Enums']['activity_action']
          actor_agent_id?: string | null
          actor_type?: Database['public']['Enums']['activity_actor_type']
          actor_user_id?: string | null
          after?: Json | null
          archived_at?: string | null
          before?: Json | null
          content?: string | null
          context?: NonNullable<Json>
          created_at?: string
          diff?: Json | null
          entity_id?: string
          entity_type?: Database['public']['Enums']['activity_entity']
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'activity_events_actor_agent_id_fkey'
            columns: ['actor_agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activity_events_actor_user_id_fkey'
            columns: ['actor_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      activity_summaries: {
        Row: {
          actions: NonNullable<Json>
          actors: NonNullable<Json>
          created_at: string
          entity_id: string
          entity_type: Database['public']['Enums']['activity_entity']
          event_count: number
          highlights: string | null
          id: string
          window_end: string
          window_start: string
        }
        ComputedFields: never
        Insert: {
          actions?: NonNullable<Json>
          actors?: NonNullable<Json>
          created_at?: string
          entity_id: string
          entity_type: Database['public']['Enums']['activity_entity']
          event_count?: number
          highlights?: string | null
          id?: string
          window_end: string
          window_start: string
        }
        Update: {
          actions?: NonNullable<Json>
          actors?: NonNullable<Json>
          created_at?: string
          entity_id?: string
          entity_type?: Database['public']['Enums']['activity_entity']
          event_count?: number
          highlights?: string | null
          id?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      agent_run_steps: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          input: Json | null
          output: Json | null
          run_id: string
          status: string
          step_index: number
          step_type: string
          tool_name: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          input?: Json | null
          output?: Json | null
          run_id: string
          status: string
          step_index: number
          step_type: string
          tool_name?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          input?: Json | null
          output?: Json | null
          run_id?: string
          status?: string
          step_index?: number
          step_type?: string
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'agent_run_steps_run_id_fkey'
            columns: ['run_id']
            isOneToOne: false
            referencedRelation: 'agent_runs'
            referencedColumns: ['id']
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_role: string
          completed_at: string | null
          conversation_id: string | null
          dispatch_depth: number
          error: string | null
          id: string
          idempotency_key: string | null
          input_message: string
          output_message: string | null
          parent_run_id: string | null
          started_at: string
          status: string
          token_usage: Json | null
          tool_call_count: number
          user_id: string
        }
        ComputedFields: never
        Insert: {
          agent_role: string
          completed_at?: string | null
          conversation_id?: string | null
          dispatch_depth?: number
          error?: string | null
          id?: string
          idempotency_key?: string | null
          input_message: string
          output_message?: string | null
          parent_run_id?: string | null
          started_at?: string
          status?: string
          token_usage?: Json | null
          tool_call_count?: number
          user_id: string
        }
        Update: {
          agent_role?: string
          completed_at?: string | null
          conversation_id?: string | null
          dispatch_depth?: number
          error?: string | null
          id?: string
          idempotency_key?: string | null
          input_message?: string
          output_message?: string | null
          parent_run_id?: string | null
          started_at?: string
          status?: string
          token_usage?: Json | null
          tool_call_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'agent_runs_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'agent_runs_parent_run_id_fkey'
            columns: ['parent_run_id']
            isOneToOne: false
            referencedRelation: 'agent_runs'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'agent_runs_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      agents: {
        Row: {
          chat_enabled: boolean
          created_at: string
          id: string
          input_schema: NonNullable<Json>
          is_active: boolean
          model_name: string | null
          model_provider: string | null
          name: string
          output_schema: NonNullable<Json>
          prompt_template: string
          responsibility: string
          role: Database['public']['Enums']['agent_role']
        }
        ComputedFields: never
        Insert: {
          chat_enabled?: boolean
          created_at?: string
          id?: string
          input_schema?: NonNullable<Json>
          is_active?: boolean
          model_name?: string | null
          model_provider?: string | null
          name: string
          output_schema?: NonNullable<Json>
          prompt_template: string
          responsibility: string
          role: Database['public']['Enums']['agent_role']
        }
        Update: {
          chat_enabled?: boolean
          created_at?: string
          id?: string
          input_schema?: NonNullable<Json>
          is_active?: boolean
          model_name?: string | null
          model_provider?: string | null
          name?: string
          output_schema?: NonNullable<Json>
          prompt_template?: string
          responsibility?: string
          role?: Database['public']['Enums']['agent_role']
        }
        Relationships: []
      }
      broadcast_accounts: {
        Row: {
          account_handle: string
          account_url: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          platform: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          account_handle: string
          account_url?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          platform: string
          updated_at?: string
        }
        Update: {
          account_handle?: string
          account_url?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_task_positions: {
        Row: {
          created_at: string
          id: string
          position_id: string
          task_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          position_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'business_task_positions_position_id_fkey'
            columns: ['position_id']
            isOneToOne: false
            referencedRelation: 'positions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'business_task_positions_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'business_tasks'
            referencedColumns: ['id']
          },
        ]
      }
      business_tasks: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'business_tasks_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          id: string
          key: string
          name: string
          owner_creator_id: string | null
          owner_member_type: string | null
          owner_user_id: string | null
          sort_order: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          key: string
          name: string
          owner_creator_id?: string | null
          owner_member_type?: string | null
          owner_user_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          name?: string
          owner_creator_id?: string | null
          owner_member_type?: string | null
          owner_user_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'businesses_owner_creator_id_fkey'
            columns: ['owner_creator_id']
            isOneToOne: false
            referencedRelation: 'creators'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'businesses_owner_user_id_fkey'
            columns: ['owner_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      checkpoint_blobs: {
        Row: {
          blob: string | null
          channel: string
          checkpoint_ns: string
          thread_id: string
          type: string
          version: string
        }
        ComputedFields: never
        Insert: {
          blob?: string | null
          channel: string
          checkpoint_ns?: string
          thread_id: string
          type: string
          version: string
        }
        Update: {
          blob?: string | null
          channel?: string
          checkpoint_ns?: string
          thread_id?: string
          type?: string
          version?: string
        }
        Relationships: []
      }
      checkpoint_migrations: {
        Row: {
          v: number
        }
        ComputedFields: never
        Insert: {
          v: number
        }
        Update: {
          v?: number
        }
        Relationships: []
      }
      checkpoint_writes: {
        Row: {
          blob: string
          channel: string
          checkpoint_id: string
          checkpoint_ns: string
          idx: number
          task_id: string
          task_path: string
          thread_id: string
          type: string | null
        }
        ComputedFields: never
        Insert: {
          blob: string
          channel: string
          checkpoint_id: string
          checkpoint_ns?: string
          idx: number
          task_id: string
          task_path?: string
          thread_id: string
          type?: string | null
        }
        Update: {
          blob?: string
          channel?: string
          checkpoint_id?: string
          checkpoint_ns?: string
          idx?: number
          task_id?: string
          task_path?: string
          thread_id?: string
          type?: string | null
        }
        Relationships: []
      }
      checkpoints: {
        Row: {
          checkpoint: NonNullable<Json>
          checkpoint_id: string
          checkpoint_ns: string
          metadata: NonNullable<Json>
          parent_checkpoint_id: string | null
          thread_id: string
          type: string | null
        }
        ComputedFields: never
        Insert: {
          checkpoint: NonNullable<Json>
          checkpoint_id: string
          checkpoint_ns?: string
          metadata?: NonNullable<Json>
          parent_checkpoint_id?: string | null
          thread_id: string
          type?: string | null
        }
        Update: {
          checkpoint?: NonNullable<Json>
          checkpoint_id?: string
          checkpoint_ns?: string
          metadata?: NonNullable<Json>
          parent_checkpoint_id?: string | null
          thread_id?: string
          type?: string | null
        }
        Relationships: []
      }
      competitor_companies: {
        Row: {
          capital_background: string
          capital_note: string
          created_at: string
          group_format: string
          id: string
          info_as_of: string | null
          legal_name: string | null
          location: string
          name: string
          note: string
          recruit_note: string
          scale: string
          sort_order: number
          sources: NonNullable<Json>
          updated_at: string
          website: string | null
        }
        ComputedFields: never
        Insert: {
          capital_background?: string
          capital_note?: string
          created_at?: string
          group_format?: string
          id?: string
          info_as_of?: string | null
          legal_name?: string | null
          location?: string
          name: string
          note?: string
          recruit_note?: string
          scale?: string
          sort_order?: number
          sources?: NonNullable<Json>
          updated_at?: string
          website?: string | null
        }
        Update: {
          capital_background?: string
          capital_note?: string
          created_at?: string
          group_format?: string
          id?: string
          info_as_of?: string | null
          legal_name?: string | null
          location?: string
          name?: string
          note?: string
          recruit_note?: string
          scale?: string
          sort_order?: number
          sources?: NonNullable<Json>
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      competitor_company_accounts: {
        Row: {
          company_id: string
          competitor_id: string | null
          created_at: string
          group_name: string
          handle: string | null
          highlight: string | null
          id: string
          note: string
          profile_snapshot: Json | null
          sort_order: number
          status: string
        }
        ComputedFields: never
        Insert: {
          company_id: string
          competitor_id?: string | null
          created_at?: string
          group_name: string
          handle?: string | null
          highlight?: string | null
          id?: string
          note?: string
          profile_snapshot?: Json | null
          sort_order?: number
          status?: string
        }
        Update: {
          company_id?: string
          competitor_id?: string | null
          created_at?: string
          group_name?: string
          handle?: string | null
          highlight?: string | null
          id?: string
          note?: string
          profile_snapshot?: Json | null
          sort_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'competitor_company_accounts_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'competitor_companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'competitor_company_accounts_competitor_id_fkey'
            columns: ['competitor_id']
            isOneToOne: false
            referencedRelation: 'competitors'
            referencedColumns: ['id']
          },
        ]
      }
      competitor_descriptions: {
        Row: {
          body: string
          competitor_id: string
          created_at: string
          created_by: string | null
          generated_on: string
          id: string
          source: string
        }
        ComputedFields: never
        Insert: {
          body: string
          competitor_id: string
          created_at?: string
          created_by?: string | null
          generated_on: string
          id?: string
          source?: string
        }
        Update: {
          body?: string
          competitor_id?: string
          created_at?: string
          created_by?: string | null
          generated_on?: string
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: 'competitor_descriptions_competitor_id_fkey'
            columns: ['competitor_id']
            isOneToOne: false
            referencedRelation: 'competitors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'competitor_descriptions_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      competitor_live_sessions: {
        Row: {
          competitor_id: string
          created_at: string
          created_by: string | null
          ended_at: string
          id: string
          likes: number | null
          source: string
          started_at: string
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          competitor_id: string
          created_at?: string
          created_by?: string | null
          ended_at: string
          id?: string
          likes?: number | null
          source?: string
          started_at: string
          title?: string
          updated_at?: string
        }
        Update: {
          competitor_id?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string
          id?: string
          likes?: number | null
          source?: string
          started_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'competitor_live_sessions_competitor_id_fkey'
            columns: ['competitor_id']
            isOneToOne: false
            referencedRelation: 'competitors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'competitor_live_sessions_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      competitor_live_summaries: {
        Row: {
          body: string
          created_at: string
          generated_on: string
          id: string
          source: string
          subtitle: string
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          body: string
          created_at?: string
          generated_on: string
          id?: string
          source?: string
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          generated_on?: string
          id?: string
          source?: string
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      competitor_shots: {
        Row: {
          caption: string
          captured_at: string | null
          competitor_id: string
          created_at: string
          created_by: string | null
          id: string
          image_url: string
          shot_on: string | null
          sort_order: number
          stream_started_at: string | null
          tag: string | null
          viewer_count: number | null
        }
        ComputedFields: never
        Insert: {
          caption?: string
          captured_at?: string | null
          competitor_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url: string
          shot_on?: string | null
          sort_order?: number
          stream_started_at?: string | null
          tag?: string | null
          viewer_count?: number | null
        }
        Update: {
          caption?: string
          captured_at?: string | null
          competitor_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string
          shot_on?: string | null
          sort_order?: number
          stream_started_at?: string | null
          tag?: string | null
          viewer_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'competitor_shots_competitor_id_fkey'
            columns: ['competitor_id']
            isOneToOne: false
            referencedRelation: 'competitors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'competitor_shots_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      competitor_snapshots: {
        Row: {
          bio: string | null
          captured_at: string
          captured_on: string
          competitor_id: string
          display_name: string | null
          followers: number | null
          following: number | null
          id: string
          language: string | null
          likes: number | null
          raw: Json | null
          region: string | null
          verified: boolean | null
          videos: number | null
        }
        ComputedFields: never
        Insert: {
          bio?: string | null
          captured_at?: string
          captured_on: string
          competitor_id: string
          display_name?: string | null
          followers?: number | null
          following?: number | null
          id?: string
          language?: string | null
          likes?: number | null
          raw?: Json | null
          region?: string | null
          verified?: boolean | null
          videos?: number | null
        }
        Update: {
          bio?: string | null
          captured_at?: string
          captured_on?: string
          competitor_id?: string
          display_name?: string | null
          followers?: number | null
          following?: number | null
          id?: string
          language?: string | null
          likes?: number | null
          raw?: Json | null
          region?: string | null
          verified?: boolean | null
          videos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'competitor_snapshots_competitor_id_fkey'
            columns: ['competitor_id']
            isOneToOne: false
            referencedRelation: 'competitors'
            referencedColumns: ['id']
          },
        ]
      }
      competitor_viewer_readings: {
        Row: {
          captured_at: string
          competitor_id: string
          created_at: string
          created_by: string | null
          id: string
          shot_id: string | null
          source: string
          viewer_count: number | null
          viewer_source: string | null
          viewer_text: string | null
        }
        ComputedFields: never
        Insert: {
          captured_at: string
          competitor_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          shot_id?: string | null
          source: string
          viewer_count?: number | null
          viewer_source?: string | null
          viewer_text?: string | null
        }
        Update: {
          captured_at?: string
          competitor_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          shot_id?: string | null
          source?: string
          viewer_count?: number | null
          viewer_source?: string | null
          viewer_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'competitor_viewer_readings_competitor_id_fkey'
            columns: ['competitor_id']
            isOneToOne: false
            referencedRelation: 'competitors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'competitor_viewer_readings_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'competitor_viewer_readings_shot_id_fkey'
            columns: ['shot_id']
            isOneToOne: false
            referencedRelation: 'competitor_shots'
            referencedColumns: ['id']
          },
        ]
      }
      competitors: {
        Row: {
          avatar_url: string | null
          composition: string | null
          counts_as_of: string | null
          created_at: string
          created_by: string | null
          display_name: string | null
          followers: number | null
          handle: string
          id: string
          latest_videos: Json | null
          launch_city: string | null
          launched_on: string | null
          likes_count: number | null
          mc_note: string | null
          member_count: number | null
          note: string
          online_note: string | null
          parent_id: string | null
          platform: string
          profile_url: string
          region: string | null
          video_count: number | null
        }
        ComputedFields: never
        Insert: {
          avatar_url?: string | null
          composition?: string | null
          counts_as_of?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          followers?: number | null
          handle: string
          id?: string
          latest_videos?: Json | null
          launch_city?: string | null
          launched_on?: string | null
          likes_count?: number | null
          mc_note?: string | null
          member_count?: number | null
          note?: string
          online_note?: string | null
          parent_id?: string | null
          platform?: string
          profile_url: string
          region?: string | null
          video_count?: number | null
        }
        Update: {
          avatar_url?: string | null
          composition?: string | null
          counts_as_of?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          followers?: number | null
          handle?: string
          id?: string
          latest_videos?: Json | null
          launch_city?: string | null
          launched_on?: string | null
          likes_count?: number | null
          mc_note?: string | null
          member_count?: number | null
          note?: string
          online_note?: string | null
          parent_id?: string | null
          platform?: string
          profile_url?: string
          region?: string | null
          video_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'competitors_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'competitors_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'competitors'
            referencedColumns: ['id']
          },
        ]
      }
      config: {
        Row: {
          description: string
          id: string
          key: string
          updated_at: string
          value: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          description?: string
          id?: string
          key: string
          updated_at?: string
          value?: NonNullable<Json>
        }
        Update: {
          description?: string
          id?: string
          key?: string
          updated_at?: string
          value?: NonNullable<Json>
        }
        Relationships: []
      }
      conversation_messages: {
        Row: {
          agent_id: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          sender_type: string
        }
        ComputedFields: never
        Insert: {
          agent_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_type: string
        }
        Update: {
          agent_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversation_messages_agent_id_fkey'
            columns: ['agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversation_messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
        ]
      }
      conversations: {
        Row: {
          agent_id: string
          created_at: string
          deprecated_at: string | null
          id: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          agent_id: string
          created_at?: string
          deprecated_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          deprecated_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'conversations_agent_id_fkey'
            columns: ['agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversations_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      creator_activity_logs: {
        Row: {
          activity_type: Database['public']['Enums']['activity_type']
          actor: string
          created_at: string
          creator_id: string
          description: string | null
          id: string
          metadata: NonNullable<Json>
          title: string
        }
        ComputedFields: never
        Insert: {
          activity_type: Database['public']['Enums']['activity_type']
          actor?: string
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          metadata?: NonNullable<Json>
          title: string
        }
        Update: {
          activity_type?: Database['public']['Enums']['activity_type']
          actor?: string
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          metadata?: NonNullable<Json>
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'creator_activity_logs_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'creators'
            referencedColumns: ['id']
          },
        ]
      }
      creators: {
        Row: {
          broadcast_account_id: string | null
          contact_info: NonNullable<Json>
          created_at: string
          created_by_user_id: string | null
          id: string
          name: string
          notes: string | null
          operator_user_id: string | null
          platform: string
          profile: NonNullable<Json>
          status: Database['public']['Enums']['creator_status']
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          broadcast_account_id?: string | null
          contact_info?: NonNullable<Json>
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          name: string
          notes?: string | null
          operator_user_id?: string | null
          platform: string
          profile?: NonNullable<Json>
          status?: Database['public']['Enums']['creator_status']
          updated_at?: string
        }
        Update: {
          broadcast_account_id?: string | null
          contact_info?: NonNullable<Json>
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          operator_user_id?: string | null
          platform?: string
          profile?: NonNullable<Json>
          status?: Database['public']['Enums']['creator_status']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'creators_broadcast_account_id_fkey'
            columns: ['broadcast_account_id']
            isOneToOne: false
            referencedRelation: 'broadcast_accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'creators_created_by_user_id_fkey'
            columns: ['created_by_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'creators_operator_user_id_fkey'
            columns: ['operator_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      devices: {
        Row: {
          buyer_name: string
          created_at: string
          device_name: string
          id: string
          payment_method: string
          payment_status: string
          purchase_date: string
          purchase_location: string
          purchase_purpose: string
          quantity: number
          total_price: number | null
          unit_price: number
          updated_at: string
          user_name: string
        }
        ComputedFields: never
        Insert: {
          buyer_name?: string
          created_at?: string
          device_name: string
          id?: string
          payment_method?: string
          payment_status: string
          purchase_date: string
          purchase_location?: string
          purchase_purpose?: string
          quantity?: number
          total_price?: never
          unit_price?: number
          updated_at?: string
          user_name?: string
        }
        Update: {
          buyer_name?: string
          created_at?: string
          device_name?: string
          id?: string
          payment_method?: string
          payment_status?: string
          purchase_date?: string
          purchase_location?: string
          purchase_purpose?: string
          quantity?: number
          total_price?: never
          unit_price?: number
          updated_at?: string
          user_name?: string
        }
        Relationships: []
      }
      discussion_messages: {
        Row: {
          body: string
          channel: Database['public']['Enums']['discussion_channel']
          created_at: string
          deleted_at: string | null
          id: string
          metadata: NonNullable<Json>
          parent_id: string | null
          sender_agent_id: string | null
          sender_type: Database['public']['Enums']['discussion_sender_type']
          sender_user_id: string | null
          thread_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          body: string
          channel?: Database['public']['Enums']['discussion_channel']
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: NonNullable<Json>
          parent_id?: string | null
          sender_agent_id?: string | null
          sender_type: Database['public']['Enums']['discussion_sender_type']
          sender_user_id?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: Database['public']['Enums']['discussion_channel']
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: NonNullable<Json>
          parent_id?: string | null
          sender_agent_id?: string | null
          sender_type?: Database['public']['Enums']['discussion_sender_type']
          sender_user_id?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'discussion_messages_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'discussion_messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussion_messages_sender_agent_id_fkey'
            columns: ['sender_agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussion_messages_sender_user_id_fkey'
            columns: ['sender_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussion_messages_thread_id_fkey'
            columns: ['thread_id']
            isOneToOne: false
            referencedRelation: 'discussion_threads'
            referencedColumns: ['id']
          },
        ]
      }
      discussion_threads: {
        Row: {
          assigned_agent_id: string
          created_at: string
          created_by_user_id: string
          entity_id: string | null
          entity_type: string
          id: string
          resolved_at: string | null
          resolved_by_user_id: string | null
          service_key: string
          status: Database['public']['Enums']['discussion_status']
          subject_hash: string | null
          subject_payload: NonNullable<Json>
          subject_type: Database['public']['Enums']['discussion_subject_type']
          title: string
          topic_code: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          assigned_agent_id: string
          created_at?: string
          created_by_user_id: string
          entity_id?: string | null
          entity_type: string
          id?: string
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          service_key: string
          status?: Database['public']['Enums']['discussion_status']
          subject_hash?: string | null
          subject_payload: NonNullable<Json>
          subject_type: Database['public']['Enums']['discussion_subject_type']
          title: string
          topic_code: string
          updated_at?: string
        }
        Update: {
          assigned_agent_id?: string
          created_at?: string
          created_by_user_id?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          service_key?: string
          status?: Database['public']['Enums']['discussion_status']
          subject_hash?: string | null
          subject_payload?: NonNullable<Json>
          subject_type?: Database['public']['Enums']['discussion_subject_type']
          title?: string
          topic_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'discussion_threads_assigned_agent_id_fkey'
            columns: ['assigned_agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussion_threads_created_by_user_id_fkey'
            columns: ['created_by_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussion_threads_resolved_by_user_id_fkey'
            columns: ['resolved_by_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussion_threads_service_key_fkey'
            columns: ['service_key']
            isOneToOne: false
            referencedRelation: 'service_agents'
            referencedColumns: ['service_key']
          },
        ]
      }
      discussion_topic_sequences: {
        Row: {
          last_issued_number: number
          service_key: string
          updated_at: string
          year: number
        }
        ComputedFields: never
        Insert: {
          last_issued_number?: number
          service_key: string
          updated_at?: string
          year: number
        }
        Update: {
          last_issued_number?: number
          service_key?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: 'discussion_topic_sequences_service_key_fkey'
            columns: ['service_key']
            isOneToOne: false
            referencedRelation: 'service_agents'
            referencedColumns: ['service_key']
          },
        ]
      }
      expense_saved_views: {
        Row: {
          created_at: string
          filters: NonNullable<Json>
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          filters?: NonNullable<Json>
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: NonNullable<Json>
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          buyer_name: string
          created_at: string
          created_by_user_id: string | null
          expense_category: Database['public']['Enums']['expense_category']
          expense_date: string
          id: string
          item_name: string
          location: string
          notes: string | null
          payment_method: Database['public']['Enums']['expense_payment_method'] | null
          payment_method_legacy: string | null
          payment_status: string
          period: string | null
          purpose: string
          quantity: number
          total_price: number | null
          unit_price: number
          updated_at: string
          user_name: string
        }
        ComputedFields: never
        Insert: {
          buyer_name?: string
          created_at?: string
          created_by_user_id?: string | null
          expense_category?: Database['public']['Enums']['expense_category']
          expense_date: string
          id?: string
          item_name: string
          location?: string
          notes?: string | null
          payment_method?: Database['public']['Enums']['expense_payment_method'] | null
          payment_method_legacy?: string | null
          payment_status: string
          period?: string | null
          purpose?: string
          quantity?: number
          total_price?: never
          unit_price?: number
          updated_at?: string
          user_name?: string
        }
        Update: {
          buyer_name?: string
          created_at?: string
          created_by_user_id?: string | null
          expense_category?: Database['public']['Enums']['expense_category']
          expense_date?: string
          id?: string
          item_name?: string
          location?: string
          notes?: string | null
          payment_method?: Database['public']['Enums']['expense_payment_method'] | null
          payment_method_legacy?: string | null
          payment_status?: string
          period?: string | null
          purpose?: string
          quantity?: number
          total_price?: never
          unit_price?: number
          updated_at?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: 'expenses_created_by_user_id_fkey'
            columns: ['created_by_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      finance: {
        Row: {
          cost: number
          created_at: string
          creator_id: string
          id: string
          notes: string | null
          period: string
          profit: number | null
          revenue: number
          roi: number | null
        }
        ComputedFields: never
        Insert: {
          cost?: number
          created_at?: string
          creator_id: string
          id?: string
          notes?: string | null
          period: string
          profit?: never
          revenue?: number
          roi?: never
        }
        Update: {
          cost?: number
          created_at?: string
          creator_id?: string
          id?: string
          notes?: string | null
          period?: string
          profit?: never
          revenue?: number
          roi?: never
        }
        Relationships: [
          {
            foreignKeyName: 'finance_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'creators'
            referencedColumns: ['id']
          },
        ]
      }
      finance_forecast_accounts: {
        Row: {
          account_name: string
          account_type: string
          avg_daily_hours: number
          created_at: string
          id: string
          live_days: number
          month: string
          revenue_per_minute_usd: number
          share_ratio_pct: number
          updated_at: string
          view_id: string
          year: number
        }
        ComputedFields: never
        Insert: {
          account_name?: string
          account_type: string
          avg_daily_hours?: number
          created_at?: string
          id: string
          live_days?: number
          month: string
          revenue_per_minute_usd?: number
          share_ratio_pct?: number
          updated_at?: string
          view_id: string
          year: number
        }
        Update: {
          account_name?: string
          account_type?: string
          avg_daily_hours?: number
          created_at?: string
          id?: string
          live_days?: number
          month?: string
          revenue_per_minute_usd?: number
          share_ratio_pct?: number
          updated_at?: string
          view_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: 'finance_forecast_accounts_month_fk'
            columns: ['view_id', 'year', 'month']
            isOneToOne: false
            referencedRelation: 'finance_forecast_months'
            referencedColumns: ['view_id', 'year', 'month']
          },
        ]
      }
      finance_forecast_lifecycle_templates: {
        Row: {
          account_type_at_month: string
          avg_daily_hours: number
          created_at: string
          live_days: number
          month_offset: number
          revenue_per_minute_usd: number
          share_ratio_pct: number
          starting_stage: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          account_type_at_month: string
          avg_daily_hours?: number
          created_at?: string
          live_days?: number
          month_offset: number
          revenue_per_minute_usd?: number
          share_ratio_pct?: number
          starting_stage: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type_at_month?: string
          avg_daily_hours?: number
          created_at?: string
          live_days?: number
          month_offset?: number
          revenue_per_minute_usd?: number
          share_ratio_pct?: number
          starting_stage?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'finance_forecast_lifecycle_templates_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      finance_forecast_months: {
        Row: {
          actual_revenue_usd: number
          created_at: string
          month: string
          note: string
          updated_at: string
          view_id: string
          year: number
        }
        ComputedFields: never
        Insert: {
          actual_revenue_usd?: number
          created_at?: string
          month: string
          note?: string
          updated_at?: string
          view_id: string
          year: number
        }
        Update: {
          actual_revenue_usd?: number
          created_at?: string
          month?: string
          note?: string
          updated_at?: string
          view_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: 'finance_forecast_months_view_fk'
            columns: ['view_id']
            isOneToOne: false
            referencedRelation: 'finance_forecast_views'
            referencedColumns: ['id']
          },
        ]
      }
      finance_forecast_views: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          name: string
          note: string
          owner_id: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          note?: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          note?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'finance_forecast_views_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      intent_violations: {
        Row: {
          channel: string
          created_at: string
          id: string
          intent_json: Json | null
          raw_text: string | null
          reason: string
          stage: string
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          intent_json?: Json | null
          raw_text?: string | null
          reason: string
          stage: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          intent_json?: Json | null
          raw_text?: string | null
          reason?: string
          stage?: string
          user_id?: string | null
        }
        Relationships: []
      }
      item_code_counters: {
        Row: {
          last_seq: number
          year: number
        }
        ComputedFields: never
        Insert: {
          last_seq?: number
          year: number
        }
        Update: {
          last_seq?: number
          year?: number
        }
        Relationships: []
      }
      item_status_logs: {
        Row: {
          changed_at: string
          changed_by_user_id: string | null
          from_status: string | null
          id: string
          item_id: string
          note: string | null
          to_status: string
        }
        ComputedFields: never
        Insert: {
          changed_at?: string
          changed_by_user_id?: string | null
          from_status?: string | null
          id?: string
          item_id: string
          note?: string | null
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by_user_id?: string | null
          from_status?: string | null
          id?: string
          item_id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'item_status_logs_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
        ]
      }
      items: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          expense_id: string | null
          id: string
          item_code: string
          item_value: number | null
          kind: string
          name: string
          name_en: string
          name_i18n_source: string
          name_ja: string
          notes: string | null
          photo_url: string | null
          placement_venue_item_id: string | null
          quantity: number
          responsible_person: string | null
          serial_number: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          expense_id?: string | null
          id?: string
          item_code: string
          item_value?: number | null
          kind: string
          name: string
          name_en?: string
          name_i18n_source?: string
          name_ja?: string
          notes?: string | null
          photo_url?: string | null
          placement_venue_item_id?: string | null
          quantity?: number
          responsible_person?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          expense_id?: string | null
          id?: string
          item_code?: string
          item_value?: number | null
          kind?: string
          name?: string
          name_en?: string
          name_i18n_source?: string
          name_ja?: string
          notes?: string | null
          photo_url?: string | null
          placement_venue_item_id?: string | null
          quantity?: number
          responsible_person?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'items_expense_id_fkey'
            columns: ['expense_id']
            isOneToOne: false
            referencedRelation: 'expenses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'items_placement_venue_item_id_fkey'
            columns: ['placement_venue_item_id']
            isOneToOne: false
            referencedRelation: 'venue_items'
            referencedColumns: ['id']
          },
        ]
      }
      knowledge: {
        Row: {
          category: Database['public']['Enums']['knowledge_category']
          content: string
          created_at: string
          created_by_user_id: string | null
          id: string
          tags: string[]
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          category: Database['public']['Enums']['knowledge_category']
          content: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database['public']['Enums']['knowledge_category']
          content?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'knowledge_created_by_user_id_fkey'
            columns: ['created_by_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      lifecycle_transitions: {
        Row: {
          creator_id: string
          from_status: Database['public']['Enums']['creator_status']
          id: string
          notes: string | null
          to_status: Database['public']['Enums']['creator_status']
          triggered_at: string
          triggered_by: string
        }
        ComputedFields: never
        Insert: {
          creator_id: string
          from_status: Database['public']['Enums']['creator_status']
          id?: string
          notes?: string | null
          to_status: Database['public']['Enums']['creator_status']
          triggered_at?: string
          triggered_by?: string
        }
        Update: {
          creator_id?: string
          from_status?: Database['public']['Enums']['creator_status']
          id?: string
          notes?: string | null
          to_status?: Database['public']['Enums']['creator_status']
          triggered_at?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lifecycle_transitions_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'creators'
            referencedColumns: ['id']
          },
        ]
      }
      milestones: {
        Row: {
          completed_date: string | null
          created_at: string
          created_by_user_id: string | null
          description: string | null
          id: string
          involved_agent_ids: string[]
          level: Database['public']['Enums']['milestone_level']
          linked_creator_ids: string[]
          linked_task_ids: string[]
          notes: string | null
          owner_agent_id: string | null
          parent_milestone_id: string | null
          priority: Database['public']['Enums']['milestone_priority']
          risk_level: Database['public']['Enums']['risk_level']
          start_date: string
          status: Database['public']['Enums']['milestone_status']
          success_metric: NonNullable<Json>
          target_date: string
          title: string
          type: Database['public']['Enums']['milestone_type']
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          completed_date?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          involved_agent_ids?: string[]
          level?: Database['public']['Enums']['milestone_level']
          linked_creator_ids?: string[]
          linked_task_ids?: string[]
          notes?: string | null
          owner_agent_id?: string | null
          parent_milestone_id?: string | null
          priority?: Database['public']['Enums']['milestone_priority']
          risk_level?: Database['public']['Enums']['risk_level']
          start_date: string
          status?: Database['public']['Enums']['milestone_status']
          success_metric?: NonNullable<Json>
          target_date: string
          title: string
          type: Database['public']['Enums']['milestone_type']
          updated_at?: string
        }
        Update: {
          completed_date?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          involved_agent_ids?: string[]
          level?: Database['public']['Enums']['milestone_level']
          linked_creator_ids?: string[]
          linked_task_ids?: string[]
          notes?: string | null
          owner_agent_id?: string | null
          parent_milestone_id?: string | null
          priority?: Database['public']['Enums']['milestone_priority']
          risk_level?: Database['public']['Enums']['risk_level']
          start_date?: string
          status?: Database['public']['Enums']['milestone_status']
          success_metric?: NonNullable<Json>
          target_date?: string
          title?: string
          type?: Database['public']['Enums']['milestone_type']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'milestones_created_by_user_id_fkey'
            columns: ['created_by_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'milestones_owner_agent_id_fkey'
            columns: ['owner_agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'milestones_parent_milestone_id_fkey'
            columns: ['parent_milestone_id']
            isOneToOne: false
            referencedRelation: 'milestones'
            referencedColumns: ['id']
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      pending_actions: {
        Row: {
          applied_at: string | null
          applied_id: string | null
          channel: string
          channel_msg_id: string | null
          confirmed_at: string | null
          created_at: string
          entity: string
          error_message: string | null
          expires_at: string
          id: string
          intent_json: NonNullable<Json>
          op: string
          preview_text: string
          status: Database['public']['Enums']['pending_action_status']
          target_id: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          applied_at?: string | null
          applied_id?: string | null
          channel?: string
          channel_msg_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          entity: string
          error_message?: string | null
          expires_at?: string
          id?: string
          intent_json: NonNullable<Json>
          op: string
          preview_text: string
          status?: Database['public']['Enums']['pending_action_status']
          target_id?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          applied_id?: string | null
          channel?: string
          channel_msg_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          entity?: string
          error_message?: string | null
          expires_at?: string
          id?: string
          intent_json?: NonNullable<Json>
          op?: string
          preview_text?: string
          status?: Database['public']['Enums']['pending_action_status']
          target_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pmo_instances: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          filter_config: NonNullable<Json>
          id: string
          is_active: boolean
          name: string
          reminder_config: NonNullable<Json>
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          agent_id: string
          created_at?: string
          description?: string | null
          filter_config?: NonNullable<Json>
          id?: string
          is_active?: boolean
          name: string
          reminder_config?: NonNullable<Json>
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          filter_config?: NonNullable<Json>
          id?: string
          is_active?: boolean
          name?: string
          reminder_config?: NonNullable<Json>
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'pmo_instances_agent_id_fkey'
            columns: ['agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          },
        ]
      }
      position_members: {
        Row: {
          created_at: string
          creator_id: string | null
          id: string
          member_type: string
          position_id: string
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          creator_id?: string | null
          id?: string
          member_type: string
          position_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string | null
          id?: string
          member_type?: string
          position_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'position_members_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'creators'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'position_members_position_id_fkey'
            columns: ['position_id']
            isOneToOne: false
            referencedRelation: 'positions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'position_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      positions: {
        Row: {
          created_at: string
          description: string
          id: string
          key: string
          name: string
          sort_order: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          description?: string
          id?: string
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      query_log: {
        Row: {
          breadcrumbs: string | null
          channel: string
          created_at: string
          duration_ms: number | null
          entity: string
          error_message: string | null
          flag_reason: string | null
          flagged: boolean
          id: string
          intent_json: NonNullable<Json>
          raw_text: string
          result_json: Json | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          breadcrumbs?: string | null
          channel?: string
          created_at?: string
          duration_ms?: number | null
          entity: string
          error_message?: string | null
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          intent_json: NonNullable<Json>
          raw_text: string
          result_json?: Json | null
          user_id: string
        }
        Update: {
          breadcrumbs?: string | null
          channel?: string
          created_at?: string
          duration_ms?: number | null
          entity?: string
          error_message?: string | null
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          intent_json?: NonNullable<Json>
          raw_text?: string
          result_json?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      service_agents: {
        Row: {
          agent_id: string
          created_at: string
          display_name: string
          is_active: boolean
          service_key: string
          topic_prefix: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          agent_id: string
          created_at?: string
          display_name: string
          is_active?: boolean
          service_key: string
          topic_prefix: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          display_name?: string
          is_active?: boolean
          service_key?: string
          topic_prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'service_agents_agent_id_fkey'
            columns: ['agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          },
        ]
      }
      site_applications: {
        Row: {
          age: number | null
          commute_mode: string | null
          contact: string
          created_at: string
          dance_skill_level: string | null
          dance_years: number | null
          email: string | null
          experience: string | null
          id: string
          ip_hash: string | null
          kind: string
          locale: string
          name: string
          residence: string | null
          status: string
          user_agent: string | null
        }
        ComputedFields: never
        Insert: {
          age?: number | null
          commute_mode?: string | null
          contact: string
          created_at?: string
          dance_skill_level?: string | null
          dance_years?: number | null
          email?: string | null
          experience?: string | null
          id?: string
          ip_hash?: string | null
          kind?: string
          locale: string
          name: string
          residence?: string | null
          status?: string
          user_agent?: string | null
        }
        Update: {
          age?: number | null
          commute_mode?: string | null
          contact?: string
          created_at?: string
          dance_skill_level?: string | null
          dance_years?: number | null
          email?: string | null
          experience?: string | null
          id?: string
          ip_hash?: string | null
          kind?: string
          locale?: string
          name?: string
          residence?: string | null
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      site_members: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          expected_reveal_on: string | null
          id: string
          is_revealed: boolean
          name: string | null
          name_en: string | null
          name_ja: string | null
          name_zh: string | null
          no: number
          photo_url: string | null
          specialty_en: string | null
          specialty_ja: string | null
          specialty_zh: string | null
          updated_at: string
          updated_by_user_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          expected_reveal_on?: string | null
          id?: string
          is_revealed?: boolean
          name?: string | null
          name_en?: string | null
          name_ja?: string | null
          name_zh?: string | null
          no: number
          photo_url?: string | null
          specialty_en?: string | null
          specialty_ja?: string | null
          specialty_zh?: string | null
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          expected_reveal_on?: string | null
          id?: string
          is_revealed?: boolean
          name?: string | null
          name_en?: string | null
          name_ja?: string | null
          name_zh?: string | null
          no?: number
          photo_url?: string | null
          specialty_en?: string | null
          specialty_ja?: string | null
          specialty_zh?: string | null
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'site_members_created_by_user_id_fkey'
            columns: ['created_by_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'site_members_updated_by_user_id_fkey'
            columns: ['updated_by_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      site_news: {
        Row: {
          body_en: string | null
          body_ja: string
          body_zh: string | null
          category: string
          created_at: string
          created_by_user_id: string | null
          id: string
          image_url: string | null
          is_pinned: boolean
          is_published: boolean
          lead_en: string | null
          lead_ja: string
          lead_zh: string | null
          published_on: string
          slug: string
          tag: string
          title_en: string | null
          title_ja: string
          title_zh: string | null
          updated_at: string
          updated_by_user_id: string | null
        }
        ComputedFields: never
        Insert: {
          body_en?: string | null
          body_ja: string
          body_zh?: string | null
          category?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          image_url?: string | null
          is_pinned?: boolean
          is_published?: boolean
          lead_en?: string | null
          lead_ja: string
          lead_zh?: string | null
          published_on: string
          slug: string
          tag: string
          title_en?: string | null
          title_ja: string
          title_zh?: string | null
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          body_en?: string | null
          body_ja?: string
          body_zh?: string | null
          category?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          image_url?: string | null
          is_pinned?: boolean
          is_published?: boolean
          lead_en?: string | null
          lead_ja?: string
          lead_zh?: string | null
          published_on?: string
          slug?: string
          tag?: string
          title_en?: string | null
          title_ja?: string
          title_zh?: string | null
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'site_news_created_by_user_id_fkey'
            columns: ['created_by_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'site_news_updated_by_user_id_fkey'
            columns: ['updated_by_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      task_items: {
        Row: {
          created_at: string
          due_date: string | null
          id: string
          is_important: boolean | null
          name: string
          owner_creator_id: string | null
          owner_member_type: string | null
          owner_user_id: string | null
          sort_order: number
          status: string
          task_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          due_date?: string | null
          id?: string
          is_important?: boolean | null
          name: string
          owner_creator_id?: string | null
          owner_member_type?: string | null
          owner_user_id?: string | null
          sort_order?: number
          status?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          id?: string
          is_important?: boolean | null
          name?: string
          owner_creator_id?: string | null
          owner_member_type?: string | null
          owner_user_id?: string | null
          sort_order?: number
          status?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'task_items_owner_creator_id_fkey'
            columns: ['owner_creator_id']
            isOneToOne: false
            referencedRelation: 'creators'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_items_owner_user_id_fkey'
            columns: ['owner_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_items_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'business_tasks'
            referencedColumns: ['id']
          },
        ]
      }
      tasks: {
        Row: {
          agent_id: string
          created_at: string
          creator_id: string
          id: string
          input: NonNullable<Json>
          next_action: string | null
          output: Json | null
          parent_task_id: string | null
          status: Database['public']['Enums']['task_status']
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          agent_id: string
          created_at?: string
          creator_id: string
          id?: string
          input?: NonNullable<Json>
          next_action?: string | null
          output?: Json | null
          parent_task_id?: string | null
          status?: Database['public']['Enums']['task_status']
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          creator_id?: string
          id?: string
          input?: NonNullable<Json>
          next_action?: string | null
          output?: Json | null
          parent_task_id?: string | null
          status?: Database['public']['Enums']['task_status']
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tasks_agent_id_fkey'
            columns: ['agent_id']
            isOneToOne: false
            referencedRelation: 'agents'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_creator_id_fkey'
            columns: ['creator_id']
            isOneToOne: false
            referencedRelation: 'creators'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_parent_task_id_fkey'
            columns: ['parent_task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['id']
          },
        ]
      }
      user_salary: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          monthly_salary: number
          notes: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          monthly_salary: number
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          monthly_salary?: number
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_salary_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          is_admin: boolean
          name: string
          role: Database['public']['Enums']['agent_role']
          updated_at: string
          user_code: string | null
        }
        ComputedFields: never
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          is_admin?: boolean
          name: string
          role: Database['public']['Enums']['agent_role']
          updated_at?: string
          user_code?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_admin?: boolean
          name?: string
          role?: Database['public']['Enums']['agent_role']
          updated_at?: string
          user_code?: string | null
        }
        Relationships: []
      }
      venue_editors: {
        Row: {
          created_at: string
          user_id: string
          venue_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'venue_editors_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'venue_editors_venue_id_fkey'
            columns: ['venue_id']
            isOneToOne: false
            referencedRelation: 'venues'
            referencedColumns: ['id']
          },
        ]
      }
      venue_floors: {
        Row: {
          background_image: string | null
          created_at: string
          floor_height: number
          height: number
          id: string
          name: string
          sort_order: number
          updated_at: string
          venue_id: string
          width: number
        }
        ComputedFields: never
        Insert: {
          background_image?: string | null
          created_at?: string
          floor_height?: number
          height: number
          id: string
          name: string
          sort_order?: number
          updated_at?: string
          venue_id: string
          width: number
        }
        Update: {
          background_image?: string | null
          created_at?: string
          floor_height?: number
          height?: number
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          venue_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: 'venue_floors_venue_id_fkey'
            columns: ['venue_id']
            isOneToOne: false
            referencedRelation: 'venues'
            referencedColumns: ['id']
          },
        ]
      }
      venue_items: {
        Row: {
          created_at: string
          elevation: number
          floor_id: string
          height: number
          height3d: number
          id: string
          merged_with: string[]
          name: string
          name_en: string
          name_i18n_source: string
          name_ja: string
          note: string
          placement: string
          rotation: number
          status: string
          thickness: number
          type: string
          updated_at: string
          width: number
          x: number
          y: number
          z_index: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          elevation?: number
          floor_id: string
          height?: number
          height3d?: number
          id: string
          merged_with?: string[]
          name?: string
          name_en?: string
          name_i18n_source?: string
          name_ja?: string
          note?: string
          placement?: string
          rotation?: number
          status?: string
          thickness?: number
          type: string
          updated_at?: string
          width?: number
          x?: number
          y?: number
          z_index?: number
        }
        Update: {
          created_at?: string
          elevation?: number
          floor_id?: string
          height?: number
          height3d?: number
          id?: string
          merged_with?: string[]
          name?: string
          name_en?: string
          name_i18n_source?: string
          name_ja?: string
          note?: string
          placement?: string
          rotation?: number
          status?: string
          thickness?: number
          type?: string
          updated_at?: string
          width?: number
          x?: number
          y?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: 'venue_items_floor_id_fkey'
            columns: ['floor_id']
            isOneToOne: false
            referencedRelation: 'venue_floors'
            referencedColumns: ['id']
          },
        ]
      }
      venues: {
        Row: {
          created_at: string
          height: number
          id: string
          name: string
          owner_id: string | null
          updated_at: string
          view_bookmarks: NonNullable<Json>
          width: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          height: number
          id: string
          name: string
          owner_id?: string | null
          updated_at?: string
          view_bookmarks?: NonNullable<Json>
          width: number
        }
        Update: {
          created_at?: string
          height?: number
          id?: string
          name?: string
          owner_id?: string | null
          updated_at?: string
          view_bookmarks?: NonNullable<Json>
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: 'venues_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      view_sessions: {
        Row: {
          created_at: string
          ended_at: string
          id: string
          routes: string[]
          started_at: string
          user_id: string
          views: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          ended_at: string
          id?: string
          routes?: string[]
          started_at: string
          user_id: string
          views?: NonNullable<Json>
        }
        Update: {
          created_at?: string
          ended_at?: string
          id?: string
          routes?: string[]
          started_at?: string
          user_id?: string
          views?: NonNullable<Json>
        }
        Relationships: [
          {
            foreignKeyName: 'view_sessions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      work_tasks: {
        Row: {
          business_task_item_id: string | null
          business_task_item_name: string | null
          completion_criteria: string | null
          created_at: string
          department: Database['public']['Enums']['agent_role']
          description: string | null
          due_date: string | null
          effort_hours: number
          executor_ids: string[]
          id: string
          milestone_id: string | null
          notes: string | null
          owner_user_id: string
          repeat_interval: string | null
          reviewer_user_id: string | null
          status: Database['public']['Enums']['work_task_status']
          task_date: string
          task_type: Database['public']['Enums']['work_task_type']
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          business_task_item_id?: string | null
          business_task_item_name?: string | null
          completion_criteria?: string | null
          created_at?: string
          department: Database['public']['Enums']['agent_role']
          description?: string | null
          due_date?: string | null
          effort_hours?: number
          executor_ids?: string[]
          id?: string
          milestone_id?: string | null
          notes?: string | null
          owner_user_id: string
          repeat_interval?: string | null
          reviewer_user_id?: string | null
          status?: Database['public']['Enums']['work_task_status']
          task_date: string
          task_type?: Database['public']['Enums']['work_task_type']
          title: string
          updated_at?: string
        }
        Update: {
          business_task_item_id?: string | null
          business_task_item_name?: string | null
          completion_criteria?: string | null
          created_at?: string
          department?: Database['public']['Enums']['agent_role']
          description?: string | null
          due_date?: string | null
          effort_hours?: number
          executor_ids?: string[]
          id?: string
          milestone_id?: string | null
          notes?: string | null
          owner_user_id?: string
          repeat_interval?: string | null
          reviewer_user_id?: string | null
          status?: Database['public']['Enums']['work_task_status']
          task_date?: string
          task_type?: Database['public']['Enums']['work_task_type']
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'work_tasks_business_task_item_id_fkey'
            columns: ['business_task_item_id']
            isOneToOne: false
            referencedRelation: 'task_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'work_tasks_milestone_id_fkey'
            columns: ['milestone_id']
            isOneToOne: false
            referencedRelation: 'milestones'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'work_tasks_owner_user_id_fkey'
            columns: ['owner_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'work_tasks_reviewer_user_id_fkey'
            columns: ['reviewer_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_unique_user_code: {
        Args: { current_user_id?: string; source_email: string; source_name: string }
        Returns: string
      }
      is_scoped_account: { Args: Record<PropertyKey, never>; Returns: boolean }
      next_discussion_topic_code: { Args: { p_service_key: string }; Returns: string }
      user_code_prefix: { Args: { source_email: string; source_name: string }; Returns: string }
    }
    Enums: {
      activity_action:
        | 'create'
        | 'update'
        | 'delete'
        | 'status_change'
        | 'execute'
        | 'message_sent'
        | 'message_received'
      activity_actor_type: 'user' | 'agent' | 'system'
      activity_entity:
        | 'creator'
        | 'task'
        | 'milestone'
        | 'finance'
        | 'device'
        | 'conversation'
        | 'broadcast_account'
        | 'user'
        | 'knowledge'
        | 'agent'
      activity_type:
        | 'created'
        | 'updated'
        | 'status_changed'
        | 'task_created'
        | 'task_completed'
        | 'finance_logged'
        | 'note_added'
        | 'contact_updated'
        | 'profile_updated'
        | 'other'
      agent_role: 'bd' | 'ops' | 'finance' | 'content' | 'growth' | 'legal' | 'pmo' | 'tech'
      creator_status:
        | 'prospect'
        | 'contacted'
        | 'engaged'
        | 'onboarded'
        | 'live_ready'
        | 'live'
        | 'monetized'
        | 'terminated'
      discussion_channel: 'web' | 'email' | 'im'
      discussion_sender_type: 'user' | 'agent' | 'external'
      discussion_status: 'open' | 'resolved'
      discussion_subject_type: 'record' | 'filter' | 'saved_view'
      expense_category:
        | 'tangible_asset'
        | 'salary'
        | 'rent'
        | 'travel'
        | 'office_supplies'
        | 'cloud_services'
      expense_payment_method: 'company_account' | 'wechat_pay' | 'alipay' | 'bank_card'
      knowledge_category:
        | 'outreach_scripts'
        | 'onboarding_materials'
        | 'live_strategies'
        | 'objection_handling'
      milestone_level: 'company' | 'department' | 'creator'
      milestone_priority: 'high' | 'medium' | 'low'
      milestone_status: 'planned' | 'active' | 'at_risk' | 'completed' | 'missed'
      milestone_type: 'campaign' | 'launch' | 'recruitment' | 'finance' | 'review'
      pending_action_status:
        | 'pending'
        | 'confirmed'
        | 'applied'
        | 'cancelled'
        | 'expired'
        | 'failed'
      risk_level: 'low' | 'medium' | 'high'
      task_status: 'pending' | 'running' | 'done' | 'failed'
      work_task_status: 'planned' | 'doing' | 'done' | 'cancelled'
      work_task_type: 'fixed' | 'adhoc'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_action: [
        'create',
        'update',
        'delete',
        'status_change',
        'execute',
        'message_sent',
        'message_received',
      ],
      activity_actor_type: ['user', 'agent', 'system'],
      activity_entity: [
        'creator',
        'task',
        'milestone',
        'finance',
        'device',
        'conversation',
        'broadcast_account',
        'user',
        'knowledge',
        'agent',
      ],
      activity_type: [
        'created',
        'updated',
        'status_changed',
        'task_created',
        'task_completed',
        'finance_logged',
        'note_added',
        'contact_updated',
        'profile_updated',
        'other',
      ],
      agent_role: ['bd', 'ops', 'finance', 'content', 'growth', 'legal', 'pmo', 'tech'],
      creator_status: [
        'prospect',
        'contacted',
        'engaged',
        'onboarded',
        'live_ready',
        'live',
        'monetized',
        'terminated',
      ],
      discussion_channel: ['web', 'email', 'im'],
      discussion_sender_type: ['user', 'agent', 'external'],
      discussion_status: ['open', 'resolved'],
      discussion_subject_type: ['record', 'filter', 'saved_view'],
      expense_category: [
        'tangible_asset',
        'salary',
        'rent',
        'travel',
        'office_supplies',
        'cloud_services',
      ],
      expense_payment_method: ['company_account', 'wechat_pay', 'alipay', 'bank_card'],
      knowledge_category: [
        'outreach_scripts',
        'onboarding_materials',
        'live_strategies',
        'objection_handling',
      ],
      milestone_level: ['company', 'department', 'creator'],
      milestone_priority: ['high', 'medium', 'low'],
      milestone_status: ['planned', 'active', 'at_risk', 'completed', 'missed'],
      milestone_type: ['campaign', 'launch', 'recruitment', 'finance', 'review'],
      pending_action_status: ['pending', 'confirmed', 'applied', 'cancelled', 'expired', 'failed'],
      risk_level: ['low', 'medium', 'high'],
      task_status: ['pending', 'running', 'done', 'failed'],
      work_task_status: ['planned', 'doing', 'done', 'cancelled'],
      work_task_type: ['fixed', 'adhoc'],
    },
  },
} as const
